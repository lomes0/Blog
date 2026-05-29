"use client";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Divider,
  List,
  ListItem,
  ListItemText,
  Typography,
} from "@mui/material";
import { AlertCircle, AlertTriangle, CloudDownload, Download, Info } from "lucide-react";
import { useExportImportActions } from "@/hooks/useExportImportActions";
import { useAsyncOp } from "@/hooks/useAsyncOp";

type CloudData = { filename: string };
type LocalData = { filename: string; documents: number; warnings: string[] };

export const ExportTab: React.FC = () => {
  const { user, runExportCloud, runExportLocal } = useExportImportActions();
  const cloud = useAsyncOp<CloudData>();
  const local = useAsyncOp<LocalData>();

  const handleCloudExport = () =>
    cloud.execute(async () => {
      const r = await runExportCloud();
      return r.ok ? { ok: true, data: { filename: r.filename } } : r;
    });

  const handleLocalExport = () =>
    local.execute(async () => {
      const r = await runExportLocal();
      return r.ok
        ? {
          ok: true,
          data: {
            filename: r.filename,
            documents: r.documents,
            warnings: r.warnings,
          },
        }
        : r;
    });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Cloud export */}
      <Box>
        <Typography variant="subtitle1" gutterBottom>
          Cloud backup
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Downloads all your saved cloud documents, series, revision history,
          and uploaded files as a single <code>.zip</code> archive.
        </Typography>
        {!user && (
          <Alert severity="info" sx={{ mb: 1.5 }} icon={<Info />}>
            Sign in to export cloud documents.
          </Alert>
        )}
        <Button
          variant="contained"
          startIcon={cloud.loading
            ? <CircularProgress size={16} color="inherit" />
            : <CloudDownload />}
          onClick={handleCloudExport}
          disabled={cloud.loading || !user}
        >
          {cloud.loading ? "Exporting…" : "Export cloud backup"}
        </Button>
        <Collapse in={Boolean(cloud.error)}>
          <Alert severity="error" sx={{ mt: 1.5 }} icon={<AlertCircle />}>
            {cloud.error}
          </Alert>
        </Collapse>
        <Collapse in={Boolean(cloud.data)}>
          <Alert severity="success" sx={{ mt: 1.5 }}>
            Downloaded: {cloud.data?.filename}
          </Alert>
        </Collapse>
      </Box>

      <Divider />

      {/* Local export */}
      <Box>
        <Typography variant="subtitle1" gutterBottom>
          Local backup
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Downloads documents stored locally in this browser (offline / not yet
          synced). Attachment files are included only if they have been viewed
          while online.
        </Typography>
        <Button
          variant="outlined"
          startIcon={local.loading
            ? <CircularProgress size={16} color="inherit" />
            : <Download />}
          onClick={handleLocalExport}
          disabled={local.loading}
        >
          {local.loading ? "Exporting…" : "Export local backup"}
        </Button>
        <Collapse in={Boolean(local.data)}>
          <Alert severity="success" sx={{ mt: 1.5 }}>
            Downloaded: {local.data?.filename} ({local.data?.documents}{" "}
            documents)
          </Alert>
        </Collapse>
        {local.error && (
          <Alert severity="warning" icon={<AlertTriangle />} sx={{ mt: 1.5 }}>
            {local.error}
          </Alert>
        )}
        {local.data && local.data.warnings.length > 0 && (
          <Alert severity="warning" icon={<AlertTriangle />} sx={{ mt: 1.5 }}>
            <Typography variant="body2" fontWeight={500} gutterBottom>
              {local.data.warnings.length} warning
              {local.data.warnings.length !== 1 ? "s" : ""}
            </Typography>
            <List dense disablePadding>
              {local.data.warnings.map((w, i) => (
                <ListItem key={i} disableGutters sx={{ py: 0.25 }}>
                  <ListItemText
                    primary={w}
                    primaryTypographyProps={{ variant: "caption" }}
                  />
                </ListItem>
              ))}
            </List>
          </Alert>
        )}
      </Box>
    </Box>
  );
};
