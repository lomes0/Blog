/**
 * GET /api/export
 *
 * Generates and streams a .zip backup bundle for the authenticated user
 * containing:
 *  - manifest.json
 *  - series/series.json
 *  - documents/{id}.json  (one per document, includes all revisions with data)
 *  - assets/attachments/{filename}
 *  - assets/backgrounds/{filename}
 *
 * Query params:
 *  (none — always exports the full account)
 */

import { userRoute } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import JSZip from "jszip";
import {
  CURRENT_SCHEMA_VERSION,
  type DocumentExport,
  type ExportManifest,
  type SeriesExport,
} from "@/lib/export/manifest";
import { collectAttachmentFilenames } from "@/lib/export/lexicalAssetRewriter";
import { ATTACHMENTS_DIR } from "@/lib/uploads";
import type { SerializedEditorState } from "lexical";

export const dynamic = "force-dynamic";

// Root of the Next.js public directory
const PUBLIC_DIR = path.join(process.cwd(), "public");

export const GET = userRoute(async (_request, { user }) => {
  // ── 1. Fetch all documents + revisions (with Lexical data) ──────────────
  const rawDocs = await prisma.document.findMany({
    where: { authorId: user.id },
    include: {
      revisions: {
        // A backup is history. A pending agent proposal is not yet part of it,
        // and round-tripping one through import would recreate it as an
        // ordinary revision (docs/plans/archive/agent-gating.md §3.1).
        where: { proposedAt: null },
        select: { id: true, documentId: true, createdAt: true, data: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // ── 2. Fetch all series ──────────────────────────────────────────────────
  const rawSeries = await prisma.series.findMany({
    where: { authorId: user.id },
    select: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      authorId: true,
    },
  });

  // ── 3. Build zip ─────────────────────────────────────────────────────────
  const zip = new JSZip();
  const assetsFolder = zip.folder("assets")!;
  const attachmentsFolder = assetsFolder.folder("attachments")!;
  const backgroundsFolder = assetsFolder.folder("backgrounds")!;

  let totalAssets = 0;
  const bundledAttachments = new Set<string>();
  const bundledBackgrounds = new Set<string>();

  const docExports: DocumentExport[] = [];

  for (const doc of rawDocs) {
    const revisions = doc.revisions.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      createdAt: r.createdAt.toISOString(),
      data: r.data as unknown as SerializedEditorState,
    }));

    // Collect attachment filenames referenced across ALL revisions
    const referencedAssets: string[] = [];
    for (const rev of revisions) {
      const names = collectAttachmentFilenames(rev.data);
      for (const name of names) {
        if (!referencedAssets.includes(name)) {
          referencedAssets.push(name);
        }
      }
    }

    const docExport: DocumentExport = {
      id: doc.id,
      name: doc.name,
      description: doc.description,
      head: doc.head ?? revisions[revisions.length - 1]?.id ?? "",
      handle: doc.handle,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      published: doc.published,
      collab: doc.collab,
      private: doc.private,
      baseId: doc.baseId,
      parentId: doc.parentId,
      type: "DOCUMENT",
      status: (doc.status as "ACTIVE" | "DONE") ?? "ACTIVE",
      background_image: doc.background_image,
      seriesId: doc.seriesId,
      revisions,
      referencedAssets,
    };

    docExports.push(docExport);

    // Bundle attachment files
    for (const filename of referencedAssets) {
      if (bundledAttachments.has(filename)) continue;
      const filePath = path.join(ATTACHMENTS_DIR, filename);
      if (existsSync(filePath)) {
        const content = await readFile(filePath);
        attachmentsFolder.file(filename, content);
        bundledAttachments.add(filename);
        totalAssets++;
      }
    }

    // Bundle background image if present
    if (doc.background_image) {
      // background_image is stored as e.g. "/uploads/directories/filename.jpg"
      const bgRelative = doc.background_image.replace(/^\//, "");
      const bgFilename = path.basename(bgRelative);
      if (!bundledBackgrounds.has(bgFilename)) {
        const bgPath = path.join(PUBLIC_DIR, bgRelative);
        if (existsSync(bgPath)) {
          const content = await readFile(bgPath);
          backgroundsFolder.file(bgFilename, content);
          bundledBackgrounds.add(bgFilename);
          totalAssets++;
        }
      }
    }
  }

  // Add documents to zip
  const documentsFolder = zip.folder("documents")!;
  for (const docExport of docExports) {
    documentsFolder.file(
      `${docExport.id}.json`,
      JSON.stringify(docExport, null, 2),
    );
  }

  // Add series
  const seriesFolder = zip.folder("series")!;
  const seriesExports: SeriesExport[] = rawSeries.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    authorId: s.authorId,
  }));
  seriesFolder.file("series.json", JSON.stringify(seriesExports, null, 2));

  // Add manifest
  const manifest: ExportManifest = {
    version: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: user.id,
    source: "cloud",
    stats: {
      documents: docExports.length,
      series: seriesExports.length,
      assets: totalAssets,
    },
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  // ── 4. Generate zip buffer and return ─────────────────────────────────────
  // "arraybuffer" rather than "nodebuffer": Response wants a BodyInit, and Node
  // types Buffer as ArrayBufferLike-backed, which no longer satisfies that.
  const zipBuffer = await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `backup-${dateStr}.zip`;

  return new Response(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}, { signInMessage: "Please sign in to export your data" });
