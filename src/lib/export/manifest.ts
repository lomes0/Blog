/**
 * Export bundle manifest — defines the format contract for .zip backup files.
 *
 * Bundle layout:
 *   backup-{date}.zip
 *   ├── manifest.json
 *   ├── series/series.json          ← SeriesExport[]
 *   ├── documents/{id}.json         ← DocumentExport (one per document)
 *   └── assets/
 *       ├── attachments/{filename}
 *       ├── backgrounds/{filename}
 *       └── blobs/{sha256}            ← content-addressed images
 */

import type { Revision, Series } from "@/types";

// ─── Schema versioning ──────────────────────────────────────────────────────

/**
 * Bump this when the bundle format changes in a backwards-incompatible way.
 * Import logic warns when the imported version < CURRENT but always attempts
 * to proceed.
 */
export const CURRENT_SCHEMA_VERSION = "2026-08-15";

// ─── Bundle types ────────────────────────────────────────────────────────────

export type ExportSource = "cloud" | "local" | "both";

export interface ExportManifest {
  version: string; // CURRENT_SCHEMA_VERSION at export time
  exportedAt: string; // ISO-8601 timestamp
  exportedBy: string; // User ID (cloud) or "local"
  source: ExportSource;
  stats: {
    documents: number;
    series: number;
    assets: number;
  };
  /**
   * `documentId:hash` for any blob the store could not produce at export time.
   * Present only when something was missing — a backup that is quietly short of
   * an image is worse than one that says so.
   */
  missingBlobs?: string[];
}

/** One content-addressed image carried in `assets/blobs/{hash}`. */
export interface BlobExport {
  /** sha256 of the bytes, lowercase hex — and the entry's filename. */
  hash: string;
  mimeType: string;
  size: number;
}

/** Full document record as stored inside documents/{id}.json */
export interface DocumentExport {
  id: string;
  name: string;
  description?: string | null;
  head: string; // UUID of the current/head revision
  handle?: string | null;
  createdAt: string;
  updatedAt: string;
  published?: boolean;
  collab?: boolean;
  private?: boolean;
  baseId?: string | null;
  parentId?: string | null;
  type: "DOCUMENT";
  status?: "ACTIVE" | "DONE";
  background_image?: string | null;
  seriesId?: string | null;
  revisions: Revision[];
  /** Filenames of any attachment assets referenced in this document's Lexical state */
  referencedAssets: string[];
  /**
   * The blobs this document's revisions reference, each carried in
   * `assets/blobs/{hash}` — docs/plans/blob-storage.md §9.
   *
   * Self-describing rather than a bare hash list: the zip entry is raw bytes
   * under a hash, so without `mimeType` here an import would have to guess what
   * it is holding, and the guess would end up on the `Content-Type` of every
   * later response.
   *
   * Optional because bundles written before 2026-08-15 have no such folder and
   * no such field, and their documents hold data URIs instead. Import must read
   * both shapes: an old bundle is still a complete backup of what it was.
   */
  referencedBlobs?: BlobExport[];
}

/** Minimal series record: series/series.json is SeriesExport[] */
export type SeriesExport = Pick<
  Series,
  "id" | "title" | "description" | "createdAt" | "updatedAt" | "authorId"
>;

// ─── Import result ───────────────────────────────────────────────────────────

export interface ImportSummary {
  imported: { documents: number; series: number; assets: number };
  skipped: { documents: string[]; series: string[] };
  errors: Array<{ id: string; reason: string }>;
  warnings: string[];
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateManifest(raw: unknown): ExportManifest {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid manifest: not an object");
  }
  const m = raw as Record<string, unknown>;
  if (typeof m.version !== "string") {
    throw new Error("Invalid manifest: missing version");
  }
  if (typeof m.exportedAt !== "string") {
    throw new Error("Invalid manifest: missing exportedAt");
  }
  if (m.version !== CURRENT_SCHEMA_VERSION) {
    // Warn but do not block — forward/backward compatibility
    console.warn(
      `[export/import] Bundle schema version "${m.version}" differs from ` +
        `current "${CURRENT_SCHEMA_VERSION}". Import will proceed but some ` +
        `fields may be missing or unrecognized.`,
    );
  }
  return m as unknown as ExportManifest;
}
