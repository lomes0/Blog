"use client";
/**
 * Redux thunks for export and import operations.
 *
 * Cloud operations call the server API routes.
 * Local operations use the browser-side IDB utilities.
 */

import type { ImportSummary } from "@/lib/export/manifest";
import { createApiThunk, fail } from "./createApiThunk";

/** The message a failing API route put in its JSON body, if it managed one. */
const routeError = (body: unknown, status: number): string => {
  const error = (body as { error?: { title?: string; subtitle?: string } })
    ?.error;
  return error?.subtitle ?? error?.title ?? `HTTP ${status}`;
};

// ─── Cloud export ─────────────────────────────────────────────────────────────

/**
 * Download a full cloud backup as a .zip file.
 * Triggers browser download — does not change Redux state.
 */
export const exportCloudBackup = createApiThunk(
  "app/exportCloudBackup",
  async () => {
    const response = await fetch("/api/export");
    if (!response.ok) {
      fail(
        routeError(await response.json().catch(() => ({})), response.status),
      );
    }

    // Extract filename from Content-Disposition header if possible
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] ??
      `backup-${new Date().toISOString().slice(0, 10)}.zip`;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { filename };
  },
  { title: "Export failed", logLabel: "[exportCloudBackup]" },
);

// ─── Cloud import ─────────────────────────────────────────────────────────────

/**
 * Upload a backup .zip file and import it into the cloud database.
 * Returns an ImportSummary with counts of imported/skipped/errors.
 */
export const importCloudBackup = createApiThunk(
  "app/importCloudBackup",
  async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/import", {
      method: "POST",
      body: formData,
    });

    const body = await response.json();
    if (!response.ok) fail(routeError(body, response.status));

    return body.data as ImportSummary;
  },
  { title: "Import failed", logLabel: "[importCloudBackup]" },
);

// ─── Local export ─────────────────────────────────────────────────────────────

/**
 * Build a local backup zip from IndexedDB and trigger a browser download.
 * Dynamic import keeps IDB/JSZip code out of the SSR bundle.
 */
export const exportLocalBackup = createApiThunk(
  "app/exportLocalBackup",
  async () => {
    const { buildLocalBackupZip, triggerDownload } = await import(
      "@/lib/export/localBundler"
    );
    const result = await buildLocalBackupZip();
    const filename = `local-backup-${
      new Date().toISOString().slice(0, 10)
    }.zip`;
    triggerDownload(result.blob, filename);
    return { filename, ...result.stats, warnings: result.warnings };
  },
  { title: "Local export failed", logLabel: "[exportLocalBackup]" },
);

// ─── Local import ─────────────────────────────────────────────────────────────

/**
 * Import a backup .zip file into the local IndexedDB stores.
 * Returns an ImportSummary.
 */
export const importLocalBackup = createApiThunk(
  "app/importLocalBackup",
  async (file: File) => {
    const { importLocalBackupZip } = await import("@/lib/export/localImporter");
    return await importLocalBackupZip(file);
  },
  { title: "Local import failed", logLabel: "[importLocalBackup]" },
);
