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
  /**
   * UUID of the current/head revision — `Document.headRevisionId`
   * (docs/plans/schema-organization.md §B).
   *
   * Kept under its old name here even though the column was renamed, because
   * the bundle is a format and not a projection of the schema: a `.zip` written
   * a year ago is still sitting in someone's downloads folder, and it is the
   * only copy of what it holds. Renaming the key would cost nothing today —
   * `readDocumentExport` below would accept both — and would still be a
   * gratuitous second spelling for every future reader to know about.
   */
  head: string;
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

/**
 * A document entry as it may actually arrive from a `.zip`.
 *
 * Every field is optional and unknown ones are kept, because the file on disk
 * was written by whatever build the user had at the time and is the only copy
 * of what it holds. The current spellings are admitted alongside the bundle's
 * own, so a bundle that ever does get written from the model's vocabulary still
 * reads — see {@link readDocumentExport}.
 */
export type StoredDocumentExport =
  & Partial<DocumentExport>
  & {
    /** The model's names for the three fields the bundle spells differently. */
    title?: string;
    headRevisionId?: string;
  };

/**
 * Normalise one `documents/{id}.json` entry to the shape the importers read.
 *
 * The bundle keeps the field names it was born with (`name`, `head`), and the
 * `Document` columns behind them have since been renamed
 * (docs/plans/schema-organization.md §B, §C). Both importers go through here so
 * that fact lives in one place rather than as a `??` at each of the two dozen
 * sites that read an entry — and so that "which spellings does import accept?"
 * has an answer that can be read rather than reconstructed.
 *
 * Anything the entry does not carry is left absent; the callers already supply
 * defaults, and inventing them here would hide a bundle that is genuinely short
 * of a field.
 */
export function readDocumentExport(raw: unknown): DocumentExport {
  const entry = (raw ?? {}) as StoredDocumentExport;
  return {
    ...entry,
    id: entry.id as string,
    name: entry.name ?? entry.title ?? "",
    head: entry.head ?? entry.headRevisionId ?? "",
    createdAt: entry.createdAt as string,
    updatedAt: entry.updatedAt as string,
    type: "DOCUMENT",
    revisions: entry.revisions ?? [],
    referencedAssets: entry.referencedAssets ?? [],
  };
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
