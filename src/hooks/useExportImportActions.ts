"use client";
import { useCallback } from "react";
import { useDispatch, useSelector } from "@/store";
import {
  exportCloudBackup,
  exportLocalBackup,
  importCloudBackup,
  importLocalBackup,
} from "@/store/thunks/exportThunks";
import type { ImportSummary } from "@/lib/export/manifest";

type ExportCloudResult =
  | { ok: true; filename: string }
  | { ok: false; error: string };

type ExportLocalResult =
  | { ok: true; filename: string; documents: number; warnings: string[] }
  | { ok: false; error: string };

type ImportResult =
  | { ok: true; summary: ImportSummary }
  | { ok: false; error: string };

/**
 * Encapsulates all Redux dispatch calls for export/import operations so that
 * ExportImportPanel sub-components remain free of direct useDispatch usage.
 */
export function useExportImportActions() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.user);

  const runExportCloud = useCallback(async (): Promise<ExportCloudResult> => {
    const result = await dispatch(exportCloudBackup());
    if (exportCloudBackup.rejected.match(result)) {
      const payload = result.payload as
        | { title: string; subtitle?: string }
        | undefined;
      return {
        ok: false,
        error: payload?.subtitle ?? payload?.title ?? "Export failed",
      };
    }
    const payload = result.payload as { filename: string } | undefined;
    return { ok: true, filename: payload?.filename ?? "backup.zip" };
  }, [dispatch]);

  const runExportLocal = useCallback(async (): Promise<ExportLocalResult> => {
    const result = await dispatch(exportLocalBackup());
    if (exportLocalBackup.rejected.match(result)) {
      const payload = result.payload as
        | { title: string; subtitle?: string }
        | undefined;
      return {
        ok: false,
        error: payload?.subtitle ?? payload?.title ?? "Export failed",
      };
    }
    const payload = result.payload as {
      filename: string;
      documents: number;
      warnings: string[];
    } | undefined;
    return {
      ok: true,
      filename: payload?.filename ?? "local-backup.zip",
      documents: payload?.documents ?? 0,
      warnings: payload?.warnings ?? [],
    };
  }, [dispatch]);

  const runImport = useCallback(
    async (file: File, target: "cloud" | "local"): Promise<ImportResult> => {
      const thunk = target === "cloud" ? importCloudBackup : importLocalBackup;
      const result = await dispatch(thunk(file));
      if (
        importCloudBackup.rejected.match(result) ||
        importLocalBackup.rejected.match(result)
      ) {
        const payload = result.payload as
          | { title: string; subtitle?: string }
          | undefined;
        return {
          ok: false,
          error: payload?.subtitle ?? payload?.title ?? "Import failed",
        };
      }
      return { ok: true, summary: result.payload as ImportSummary };
    },
    [dispatch],
  );

  return { user, runExportCloud, runExportLocal, runImport };
}
