/**
 * POST /api/import
 *
 * Imports a backup .zip bundle produced by GET /api/export.
 *
 * Accepts multipart/form-data with a single "file" field containing the zip.
 *
 * Behaviour on conflicts (same ID or handle already exists):
 *  - Documents/series whose ID already exists → skipped
 *  - Documents whose handle already exists   → skipped (handle uniqueness)
 *
 * Returns JSON: ImportSummary
 */

import { authOptions } from "@/lib/auth";
import { ApiError, withApiHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import JSZip from "jszip";
import { revalidatePath } from "next/cache";
import {
  type DocumentExport,
  type ImportSummary,
  type SeriesExport,
  validateManifest,
} from "@/lib/export/manifest";
import { rankForAppend } from "@/repositories/ordering";

export const dynamic = "force-dynamic";

const PUBLIC_DIR = path.join(process.cwd(), "public");

export const POST = withApiHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new ApiError(401, "Unauthorized", "Please sign in to import data");
  }
  const { user } = session;
  if (user.disabled) {
    throw new ApiError(403, "Account Disabled", "Account is disabled");
  }

  // ── 1. Parse multipart form data ─────────────────────────────────────────
  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    throw new ApiError(
      400,
      "Bad Request",
      "No file provided. Send a .zip backup as the 'file' field.",
    );
  }

  const MAX_SIZE = 1024 * 1024 * 512; // 512 MB
  if (file.size > MAX_SIZE) {
    throw new ApiError(
      400,
      "File Too Large",
      "Backup file must be under 512 MB",
    );
  }

  // ── 2. Open the zip ───────────────────────────────────────────────────────
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  // ── 3. Validate manifest ──────────────────────────────────────────────────
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new ApiError(400, "Invalid Bundle", "manifest.json not found in zip");
  }
  const manifestRaw = JSON.parse(await manifestFile.async("string"));
  validateManifest(manifestRaw); // throws or warns

  // ── 4. Import series ──────────────────────────────────────────────────────
  const summary: ImportSummary = {
    imported: { documents: 0, series: 0, assets: 0 },
    skipped: { documents: [], series: [] },
    errors: [],
    warnings: [],
  };

  const seriesFile = zip.file("series/series.json");
  if (seriesFile) {
    let seriesList: SeriesExport[] = [];
    try {
      seriesList = JSON.parse(
        await seriesFile.async("string"),
      ) as SeriesExport[];
    } catch {
      summary.errors.push({
        id: "series",
        reason: "Failed to parse series/series.json",
      });
    }

    for (const s of seriesList) {
      try {
        const exists = await prisma.series.findUnique({ where: { id: s.id } });
        if (exists) {
          summary.skipped.series.push(s.id);
          continue;
        }
        await prisma.series.create({
          data: {
            id: s.id,
            title: s.title,
            description: s.description ?? null,
            authorId: user.id, // import under the authenticated user
            rank: await rankForAppend(prisma, {
              authorId: user.id,
              seriesId: null,
              parentId: null,
            }),
            createdAt: new Date(s.createdAt),
            updatedAt: new Date(s.updatedAt),
          },
        });
        summary.imported.series++;
      } catch (err) {
        summary.errors.push({
          id: s.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // ── 5. Import documents ───────────────────────────────────────────────────
  const docFiles = Object.keys(zip.files).filter(
    (name) => name.startsWith("documents/") && name.endsWith(".json"),
  );

  for (const docFileName of docFiles) {
    let docExport: DocumentExport;
    try {
      const raw = await zip.file(docFileName)!.async("string");
      docExport = JSON.parse(raw) as DocumentExport;
    } catch {
      summary.errors.push({ id: docFileName, reason: "Failed to parse JSON" });
      continue;
    }

    try {
      // Skip if document ID already exists
      const existingById = await prisma.document.findUnique({
        where: { id: docExport.id },
        select: { id: true },
      });
      if (existingById) {
        summary.skipped.documents.push(docExport.id);
        continue;
      }

      // Skip if handle already exists
      if (docExport.handle) {
        const existingByHandle = await prisma.document.findUnique({
          where: { handle: docExport.handle },
          select: { id: true },
        });
        if (existingByHandle) {
          summary.skipped.documents.push(docExport.id);
          summary.warnings.push(
            `Document "${docExport.id}" skipped: handle "${docExport.handle}" is already in use.`,
          );
          continue;
        }
      }

      // Ensure series exists if referenced (it might have been skipped above
      // or be from a different user's bundle)
      let seriesId: string | null = docExport.seriesId ?? null;
      if (seriesId) {
        const seriesExists = await prisma.series.findUnique({
          where: { id: seriesId },
          select: { id: true },
        });
        if (!seriesExists) {
          summary.warnings.push(
            `Document "${docExport.id}": series "${seriesId}" not found — seriesId cleared.`,
          );
          seriesId = null;
        }
      }

      // Create revisions first (preserving original IDs and timestamps)
      for (const rev of docExport.revisions) {
        const revExists = await prisma.revision.findUnique({
          where: { id: rev.id },
          select: { id: true },
        });
        if (!revExists) {
          await prisma.revision.create({
            data: {
              id: rev.id,
              documentId: docExport.id,
              authorId: user.id,
              data: rev.data as unknown as NonNullable<object>,
              createdAt: new Date(rev.createdAt),
            },
          });
        }
      }

      // Determine head revision — fall back to the last revision if not among imported
      const headRevisionId = docExport.head ??
        docExport.revisions[docExport.revisions.length - 1]?.id;

      // Create the document, appended to the end of its container.
      await prisma.document.create({
        data: {
          id: docExport.id,
          name: docExport.name,
          description: docExport.description ?? null,
          head: headRevisionId ?? null,
          handle: docExport.handle ?? null,
          authorId: user.id,
          published: docExport.published ?? false,
          collab: docExport.collab ?? false,
          private: docExport.private ?? false,
          baseId: docExport.baseId ?? null,
          parentId: docExport.parentId ?? null,
          type: "DOCUMENT",
          status: (docExport.status as "ACTIVE" | "DONE") ?? "ACTIVE",
          background_image: docExport.background_image ?? null,
          sort_order: docExport.sort_order ?? null,
          rank: await rankForAppend(prisma, {
            authorId: user.id,
            seriesId,
            parentId: docExport.parentId ?? null,
          }),
          seriesId,
          seriesOrder: docExport.seriesOrder ?? null,
          createdAt: new Date(docExport.createdAt),
          updatedAt: new Date(docExport.updatedAt),
        },
      });

      summary.imported.documents++;

      // Extract and save attachment assets
      for (const filename of docExport.referencedAssets ?? []) {
        const zipPath = `assets/attachments/${filename}`;
        const assetFile = zip.file(zipPath);
        if (!assetFile) {
          summary.warnings.push(
            `Asset "${filename}" listed in document "${docExport.id}" but not found in bundle.`,
          );
          continue;
        }
        const destDir = path.join(PUBLIC_DIR, "uploads", "attachments");
        await mkdir(destDir, { recursive: true });
        const destPath = path.join(destDir, filename);
        if (!existsSync(destPath)) {
          const data = await assetFile.async("nodebuffer");
          await writeFile(destPath, data);
          summary.imported.assets++;
        }
      }

      // Extract background image if present
      if (docExport.background_image) {
        const bgFilename = path.basename(docExport.background_image);
        const zipPath = `assets/backgrounds/${bgFilename}`;
        const bgFile = zip.file(zipPath);
        if (bgFile) {
          const destDir = path.join(PUBLIC_DIR, "uploads", "directories");
          await mkdir(destDir, { recursive: true });
          const destPath = path.join(destDir, bgFilename);
          if (!existsSync(destPath)) {
            const data = await bgFile.async("nodebuffer");
            await writeFile(destPath, data);
            summary.imported.assets++;
          }
        }
      }
    } catch (err) {
      summary.errors.push({
        id: docExport.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Revalidate relevant paths
  revalidatePath("/");
  revalidatePath("/documents");
  revalidatePath("/series");

  return NextResponse.json({ data: summary });
});
