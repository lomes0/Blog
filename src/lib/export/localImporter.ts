"use client";
/**
 * Local (browser / IndexedDB) backup importer.
 *
 * Parses a .zip backup bundle and writes documents, revisions, and attachment
 * content into the local IndexedDB stores.
 *
 * Conflict policy: if a document ID already exists in IDB it is skipped.
 *
 * Usage:
 *   const file: File = /* from file picker *\/
 *   const summary = await importLocalBackupZip(file);
 */

import JSZip from "jszip";
import { attachmentContentDB, documentDB, revisionDB } from "@/indexeddb";
import type { AttachmentContentCache } from "@/indexeddb";
import {
  type DocumentExport,
  type ImportSummary,
  validateManifest,
} from "@/lib/export/manifest";
import { DocumentStatus, type Post, type Revision } from "@/types";
import { filenameToAttachmentUrl } from "@/lib/export/lexicalAssetRewriter";

/**
 * Import a backup zip file into the local IndexedDB stores.
 */
export async function importLocalBackupZip(
  file: File,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    imported: { documents: 0, series: 0, assets: 0 },
    skipped: { documents: [], series: [] },
    errors: [],
    warnings: [],
  };

  // ── Open zip ──────────────────────────────────────────────────────────────
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  // ── Validate manifest ──────────────────────────────────────────────────────
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error("Invalid backup bundle: manifest.json not found");
  }
  validateManifest(JSON.parse(await manifestFile.async("string")));

  // Local import: series are cloud-only, just note the warning
  const seriesFile = zip.file("series/series.json");
  if (seriesFile) {
    try {
      const seriesList = JSON.parse(await seriesFile.async("string"));
      if (Array.isArray(seriesList) && seriesList.length > 0) {
        summary.warnings.push(
          `Bundle contains ${seriesList.length} series. Series are cloud-only and were not imported into local storage.`,
        );
      }
    } catch {
      // ignore parse errors for optional metadata
    }
  }

  // ── Import documents ───────────────────────────────────────────────────────
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
      // Skip if document ID already exists in IDB
      const existing = await documentDB.getByID(docExport.id) as
        | Post
        | undefined;
      if (existing) {
        summary.skipped.documents.push(docExport.id);
        continue;
      }

      // Save revisions first
      for (const rev of docExport.revisions) {
        const revRecord: Revision = {
          id: rev.id,
          documentId: rev.documentId,
          data: rev.data,
          createdAt: rev.createdAt,
        };
        // update() uses IDBObjectStore.put — upsert semantics; safe to call even if revision exists
        await revisionDB.update(revRecord);
      }

      // Build the Post record — use head revision's data for the
      // .data field (the most up-to-date state)
      const headRev = docExport.revisions.find((r) =>
        r.id === docExport.head
      ) ??
        docExport.revisions[docExport.revisions.length - 1];

      const docRecord: Post = {
        id: docExport.id,
        name: docExport.name,
        description: docExport.description,
        head: docExport.head,
        data: headRev?.data ??
          {
            root: {
              children: [],
              direction: null,
              format: "",
              indent: 0,
              type: "root",
              version: 1,
            },
          },
        createdAt: docExport.createdAt,
        updatedAt: docExport.updatedAt,
        handle: docExport.handle,
        baseId: docExport.baseId,
        parentId: docExport.parentId,
        type: "DOCUMENT",
        status: docExport.status
          ? (docExport.status as DocumentStatus)
          : undefined,
        background_image: docExport.background_image,
        seriesId: docExport.seriesId,
      };

      await documentDB.update(docRecord);
      summary.imported.documents++;

      // Import attachment content from zip into IDB cache
      for (const filename of docExport.referencedAssets ?? []) {
        const zipPath = `assets/attachments/${filename}`;
        const assetFile = zip.file(zipPath);
        if (!assetFile) {
          summary.warnings.push(
            `Asset "${filename}" not found in bundle — skipped.`,
          );
          continue;
        }

        // Convert binary to base64 data URL for IDB cache format
        try {
          const bytes = await assetFile.async("uint8array");
          const mimeType = guessMimeType(filename);
          const base64 = uint8ArrayToBase64(bytes);
          const dataUrl = `data:${mimeType};base64,${base64}`;
          const url = filenameToAttachmentUrl(filename);

          const cached: AttachmentContentCache = {
            id: filename,
            url,
            content: dataUrl,
            mimetype: mimeType,
            size: bytes.length,
            cachedAt: Date.now(),
          };
          await attachmentContentDB.update(cached);
          summary.imported.assets++;
        } catch (err) {
          summary.warnings.push(
            `Failed to cache asset "${filename}": ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    } catch (err) {
      summary.errors.push({
        id: docExport.id ?? docFileName,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  json: "application/json",
  zip: "application/zip",
  docx:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? "application/octet-stream";
}
