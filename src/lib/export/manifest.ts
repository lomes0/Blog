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
 *       └── backgrounds/{filename}
 */

import type { Revision, Series } from "@/types";

// ─── Schema versioning ──────────────────────────────────────────────────────

/**
 * Bump this when the bundle format changes in a backwards-incompatible way.
 * Import logic warns when the imported version < CURRENT but always attempts
 * to proceed.
 */
export const CURRENT_SCHEMA_VERSION = "2026-04-10";

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
