"use client";
/**
 * Local (browser / IndexedDB) backup bundler.
 *
 * Runs entirely in the browser. Reads all documents, revisions, and cached
 * attachment content from IndexedDB and packs them into a .zip Blob using
 * the same bundle format as the cloud export.
 *
 * Usage:
 *   const blob = await buildLocalBackupZip();
 *   triggerDownload(blob, "local-backup.zip");
 */

import JSZip from "jszip";
import { attachmentContentDB, documentDB, revisionDB } from "@/indexeddb";
import {
  CURRENT_SCHEMA_VERSION,
  type DocumentExport,
  type ExportManifest,
} from "@/lib/export/manifest";
import { collectAttachmentFilenames } from "@/lib/export/lexicalAssetRewriter";
import type { EditorDocument, EditorDocumentRevision } from "@/types";

export interface LocalBundleResult {
  blob: Blob;
  stats: { documents: number; series: number; assets: number };
  warnings: string[];
}

/**
 * Build a complete backup zip from the local IndexedDB stores.
 * Returns a Blob that callers should offer for download.
 */
export async function buildLocalBackupZip(): Promise<LocalBundleResult> {
  const warnings: string[] = [];

  // ── Read all local documents and revisions ────────────────────────────────
  const [allDocuments, allRevisions, allCachedAttachments] = await Promise.all([
    documentDB.getAll() as Promise<EditorDocument[]>,
    revisionDB.getAll() as Promise<EditorDocumentRevision[]>,
    attachmentContentDB.getAll() as Promise<
      Array<{
        id: string;
        url: string;
        content: string;
        mimetype: string;
        size: number;
        cachedAt: number;
      }>
    >,
  ]);

  // Build revision lookup by documentId
  const revisionsByDoc = new Map<string, EditorDocumentRevision[]>();
  for (const rev of allRevisions) {
    const list = revisionsByDoc.get(rev.documentId) ?? [];
    list.push(rev);
    revisionsByDoc.set(rev.documentId, list);
  }

  // Build attachment cache lookup by filename
  const cachedByFilename = new Map<
    string,
    { content: string; mimetype: string }
  >();
  for (const cached of allCachedAttachments) {
    const filename = cached.url.replace(/^\/api\/attachments\//, "");
    cachedByFilename.set(filename, {
      content: cached.content,
      mimetype: cached.mimetype,
    });
  }

  // ── Build zip ─────────────────────────────────────────────────────────────
  const zip = new JSZip();
  const documentsFolder = zip.folder("documents")!;
  const assetsFolder = zip.folder("assets")!;
  const attachmentsFolder = assetsFolder.folder("attachments")!;

  const bundledAttachments = new Set<string>();
  let totalAssets = 0;

  for (const doc of allDocuments) {
    const docRevisions = (revisionsByDoc.get(doc.id) ?? []).sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    // Collect referenced attachment filenames across all revisions
    const referencedAssets: string[] = [];
    for (const rev of docRevisions) {
      if (!rev.data) continue;
      const names = collectAttachmentFilenames(rev.data);
      for (const name of names) {
        if (!referencedAssets.includes(name)) {
          referencedAssets.push(name);
        }
      }
    }
    // Also check the current document's data field
    if (doc.data) {
      const names = collectAttachmentFilenames(doc.data);
      for (const name of names) {
        if (!referencedAssets.includes(name)) referencedAssets.push(name);
      }
    }

    const docExport: DocumentExport = {
      id: doc.id,
      name: doc.name,
      description: doc.description,
      head: doc.head,
      handle: doc.handle,
      createdAt: doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : doc.createdAt,
      updatedAt: doc.updatedAt instanceof Date
        ? doc.updatedAt.toISOString()
        : doc.updatedAt,
      type: "DOCUMENT",
      status: doc.status ?? "ACTIVE",
      background_image: doc.background_image,
      seriesId: doc.seriesId,
      baseId: doc.baseId,
      parentId: doc.parentId,
      revisions: docRevisions.map((r) => ({
        id: r.id,
        documentId: r.documentId,
        data: r.data,
        createdAt: r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : r.createdAt,
      })),
      referencedAssets,
    };

    documentsFolder.file(`${doc.id}.json`, JSON.stringify(docExport, null, 2));

    // Bundle attachment assets from IDB cache
    for (const filename of referencedAssets) {
      if (bundledAttachments.has(filename)) continue;
      const cached = cachedByFilename.get(filename);
      if (cached) {
        // content is stored as a data URL: "data:mimetype;base64,..."
        const base64Match = cached.content.match(/^data:[^;]+;base64,(.+)$/);
        if (base64Match) {
          const binary = atob(base64Match[1]);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          attachmentsFolder.file(filename, bytes);
          bundledAttachments.add(filename);
          totalAssets++;
        } else {
          warnings.push(
            `Asset "${filename}" found in cache but content is not a base64 data URL — skipped.`,
          );
        }
      } else {
        warnings.push(
          `Asset "${filename}" referenced in document "${doc.id}" was not in the local cache. ` +
            `Open the document and view the attachment while online to cache it.`,
        );
      }
    }
  }

  // Series are cloud-only; emit empty series.json for format consistency
  const seriesFolder = zip.folder("series")!;
  seriesFolder.file("series.json", JSON.stringify([], null, 2));

  // Manifest
  const manifest: ExportManifest = {
    version: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: "local",
    source: "local",
    stats: {
      documents: allDocuments.length,
      series: 0,
      assets: totalAssets,
    },
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return {
    blob,
    stats: { documents: allDocuments.length, series: 0, assets: totalAssets },
    warnings,
  };
}

/** Trigger a browser file download for a Blob. */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
