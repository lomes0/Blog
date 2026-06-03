"use client";
import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Typography,
} from "@mui/material";
import { AlertCircle, CloudUpload, Download, FileUp, Info } from "lucide-react";
import { useExportImportActions } from "@/hooks/useExportImportActions";
import { useAsyncOp } from "@/hooks/useAsyncOp";
import type { ImportSummary } from "@/lib/export/manifest";
import { ImportSummaryDisplay } from "./ImportSummaryDisplay";

type ImportTarget = "cloud" | "local";

export const ImportTab: React.FC = () => {
  const { user, runImport } = useExportImportActions();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<ImportTarget>("cloud");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const op = useAsyncOp<ImportSummary>();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] ?? null);
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    await op.execute(async () => {
      const r = await runImport(selectedFile, target);
      return r.ok ? { ok: true, data: r.summary } : r;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSelectedFile(null);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Typography variant="body2" color="text.secondary">
        Select a <code>.zip</code>{" "}
        backup previously exported from this app and choose where to restore it.
        Documents that already exist (same ID or URL handle) will be skipped.
      </Typography>

      {/* Target selector */}
      <Box sx={{ display: "flex", gap: 1 }}>
        {(["cloud", "local"] as ImportTarget[]).map((t) => (
          <Chip
            key={t}
            label={t === "cloud" ? "Cloud (database)" : "Local (this browser)"}
            icon={t === "cloud"
              ? <CloudUpload size={18} />
              : <Download size={18} />}
            variant={target === t ? "filled" : "outlined"}
            color={target === t ? "primary" : "default"}
            onClick={() => setTarget(t)}
          />
        ))}
      </Box>

      {target === "cloud" && !user && (
        <Alert severity="info" icon={<Info />}>
          Sign in to import into the cloud database.
        </Alert>
      )}

      {/* File picker */}
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          style={{ display: "none" }}
          id="import-file-input"
          onChange={handleFileChange}
        />
        <label htmlFor="import-file-input">
          <Button
            component="span"
            variant="outlined"
            startIcon={<FileUp />}
            disabled={op.loading}
          >
            Choose .zip file
          </Button>
        </label>
        {selectedFile && (
          <Typography variant="body2" color="text.secondary">
            {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)}
            {" "}
            MB)
          </Typography>
        )}
      </Box>

      {/* Import button */}
      <Box>
        <Button
          variant="contained"
          startIcon={op.loading
            ? <CircularProgress size={16} color="inherit" />
            : <CloudUpload />}
          onClick={handleImport}
          disabled={op.loading || !selectedFile ||
            (target === "cloud" && !user)}
        >
          {op.loading ? "Importing…" : "Import backup"}
        </Button>
      </Box>

      <Collapse in={Boolean(op.error)}>
        <Alert severity="error" icon={<AlertCircle />}>
          {op.error}
        </Alert>
      </Collapse>

      {op.data && <ImportSummaryDisplay summary={op.data} />}
    </Box>
  );
};
