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

import { ApiError, userRoute } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import JSZip from "jszip";
import { revalidatePath } from "next/cache";
import {
  type DocumentExport,
  readDocumentExport,
  type ImportSummary,
  type SeriesExport,
  validateManifest,
} from "@/lib/export/manifest";
import {
  addToOrder,
  containerOf,
  type OrderContainer,
} from "@/repositories/ordering";
import { reconcileDocumentBlobs } from "@/repositories/blob";
import { blobHashesFor } from "@/lib/blobRefs";
import { blobExists, hashBytes, isValidHash, putBlob } from "@/lib/storage";
import { ingestInlineBlobs } from "@/lib/blobIngest";
import { resolveWithin } from "@/lib/safePath";
import { ATTACHMENTS_DIR } from "@/lib/uploads";

export const dynamic = "force-dynamic";

export const POST = userRoute(async (request, { user }) => {
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

  /**
   * Blobs already restored from this bundle. One image referenced by twenty
   * documents is one entry in the zip and one upload — which is the property
   * the whole store exists for, applied to the restore.
   */
  const restoredBlobs = new Set<string>();

  // What each imported row's container array has to gain, applied in one write
  // per container once the whole bundle has landed (see the end of this route).
  const imported: { container: OrderContainer; id: string }[] = [];

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
            createdAt: new Date(s.createdAt),
            updatedAt: new Date(s.updatedAt),
          },
        });
        imported.push({
          container: { kind: "root", authorId: user.id },
          id: s.id,
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
      docExport = readDocumentExport(JSON.parse(raw));
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

      // The document row first, and deliberately: its revisions carry
      // `documentId` as a foreign key, so creating them ahead of it — which is
      // what this route did until docs/plans/schema-organization.md §B went
      // looking — is a constraint violation that fails every import of a
      // document this deployment has not already seen.
      //
      // It is born without a head. `headRevisionId` is a foreign key too now,
      // pointing the other way, so the pointer can only be written once the
      // revision it names exists; that is the update below. Between the two,
      // the document is a post whose content has not landed yet, which is a
      // state the whole route is already wrapped in a transaction against.
      await prisma.document.create({
        data: {
          id: docExport.id,
          title: docExport.name,
          description: docExport.description ?? null,
          handle: docExport.handle ?? null,
          authorId: user.id,
          published: docExport.published ?? false,
          collab: docExport.collab ?? false,
          private: docExport.private ?? false,
          baseId: docExport.baseId ?? null,
          parentId: docExport.parentId ?? null,
          status: (docExport.status as "ACTIVE" | "DONE") ?? "ACTIVE",
          // `docExport.background_image` is read and dropped: an old bundle
          // still carries it, and there is no longer a column to put it in
          // (docs/plans/schema-organization.md §C). It named a file whose bytes
          // were deleted (docs/plans/blob-storage.md §10.2), so nothing is lost
          // that a restore could have brought back.
          seriesId,
          createdAt: new Date(docExport.createdAt),
          updatedAt: new Date(docExport.updatedAt),
        },
      });

      // Then the revisions (preserving original IDs and timestamps)
      for (const rev of docExport.revisions) {
        const revExists = await prisma.revision.findUnique({
          where: { id: rev.id },
          select: { id: true },
        });
        if (!revExists) {
          // A bundle written before blobs existed carries its images inline.
          // Storing them now is what stops a restore from putting back the
          // duplication phase 3 removed (docs/plans/blob-storage.md §8).
          await ingestInlineBlobs(rev.data);
          await prisma.revision.create({
            data: {
              id: rev.id,
              documentId: docExport.id,
              authorId: user.id,
              data: rev.data as unknown as NonNullable<object>,
              // With the content, always (docs/plans/blob-storage.md §3).
              blobHashes: blobHashesFor(rev.data),
              createdAt: new Date(rev.createdAt),
            },
          });
        }
      }

      // Last, the head pointer — fall back to the newest revision when the
      // bundle's own head is not among the ones that landed. `undefined` leaves
      // it null, which is a document whose content the bundle did not carry.
      const headRevisionId = docExport.head ??
        docExport.revisions[docExport.revisions.length - 1]?.id;
      if (headRevisionId) {
        await prisma.document.update({
          where: { id: docExport.id },
          data: { headRevisionId },
        });
      }

      imported.push({
        container: containerOf({
          authorId: user.id,
          seriesId,
          parentId: docExport.parentId ?? null,
        }),
        id: docExport.id,
      });
      summary.imported.documents++;

      // Restore the bundle's blobs before reconciling, because a reference can
      // only be recorded against a blob this deployment holds
      // (docs/plans/blob-storage.md §9).
      for (const blob of docExport.referencedBlobs ?? []) {
        if (restoredBlobs.has(blob.hash)) continue;

        const entry = isValidHash(blob.hash)
          ? zip.file(`assets/blobs/${blob.hash}`)
          : null;
        if (!entry) {
          summary.warnings.push(
            `Blob "${blob.hash}" is referenced by document "${docExport.id}" ` +
              `but not carried in the bundle — its image will not render.`,
          );
          continue;
        }

        const bytes = await entry.async("nodebuffer");

        // **The name inside the zip is not evidence of anything.** Storing
        // these bytes under a hash the bundle merely claims would poison every
        // future deduplication of that key — the same reason `POST /api/blob`
        // hashes what it receives rather than trusting the client. A mismatch
        // is refused rather than stored under its true hash, because the
        // documents reference the claimed one and would not find it anyway.
        if (hashBytes(bytes) !== blob.hash) {
          summary.warnings.push(
            `Blob "${blob.hash}" in the bundle does not hash to its name — ` +
              `refused. The bundle is corrupt or was tampered with.`,
          );
          continue;
        }

        if (!(await blobExists(blob.hash))) {
          await putBlob(blob.hash, bytes, blob.mimeType);
        }
        await prisma.blob.upsert({
          where: { hash: blob.hash },
          create: {
            hash: blob.hash,
            size: bytes.byteLength,
            mimeType: blob.mimeType,
          },
          update: {},
        });
        restoredBlobs.add(blob.hash);
        summary.imported.assets++;
      }

      // The revisions above were written before the document row existed, so
      // their references could not be recorded then — `BlobRef` points at a
      // document.
      await reconcileDocumentBlobs(docExport.id);

      // Extract and save attachment assets. The name comes from inside the
      // uploaded zip, so it is resolved through `resolveWithin` rather than
      // joined directly — a bundle listing `../../server.js` would otherwise
      // write straight out of the uploads directory.
      for (const filename of docExport.referencedAssets ?? []) {
        const zipPath = `assets/attachments/${filename}`;
        const assetFile = zip.file(zipPath);
        if (!assetFile) {
          summary.warnings.push(
            `Asset "${filename}" listed in document "${docExport.id}" but not found in bundle.`,
          );
          continue;
        }
        const destDir = ATTACHMENTS_DIR;
        const destPath = resolveWithin(destDir, filename);
        if (!destPath) {
          summary.warnings.push(
            `Asset "${filename}" in document "${docExport.id}" has an unsafe name — skipped.`,
          );
          continue;
        }
        await mkdir(destDir, { recursive: true });
        if (!existsSync(destPath)) {
          const data = await assetFile.async("nodebuffer");
          await writeFile(destPath, data);
          summary.imported.assets++;
        }
      }

    } catch (err) {
      summary.errors.push({
        id: docExport.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Every imported row is appended to the array of the container it landed in,
  // batched by container so a bundle costs one write per list rather than one
  // per row (docs/plans/archive/ordering-simplification.md §6, "Create"). It
  // cannot be a recompute: the array is the only record of the order there is,
  // so recomputing would overwrite the author's manual order with import order.
  const byContainer = new Map<string, { kind: string; ids: string[] }>();
  for (const entry of imported) {
    const key = JSON.stringify(entry.container);
    const bucket = byContainer.get(key);
    if (bucket) bucket.ids.push(entry.id);
    else byContainer.set(key, { kind: key, ids: [entry.id] });
  }
  for (const [key, bucket] of byContainer) {
    await addToOrder(prisma, JSON.parse(key) as OrderContainer, bucket.ids);
  }

  // Revalidate relevant paths
  revalidatePath("/");
  revalidatePath("/documents");
  revalidatePath("/series");

  return NextResponse.json({ data: summary });
}, { signInMessage: "Please sign in to import data" });
