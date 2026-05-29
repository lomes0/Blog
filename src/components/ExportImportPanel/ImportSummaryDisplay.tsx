"use client";
import {
  Alert,
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  Typography,
} from "@mui/material";
import { AlertCircle, AlertTriangle } from "lucide-react";
import type { ImportSummary } from "@/lib/export/manifest";

export const ImportSummaryDisplay: React.FC<{ summary: ImportSummary }> = ({
  summary,
}) => {
  const hasErrors = summary.errors.length > 0;
  const hasWarnings = summary.warnings.length > 0;
  const hasSkipped =
    summary.skipped.documents.length + summary.skipped.series.length > 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Alert
        severity={hasErrors ? "warning" : "success"}
        icon={hasErrors ? <AlertTriangle /> : undefined}
      >
        <Typography variant="subtitle2" gutterBottom>
          Import complete
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 0.5 }}>
          <Chip
            size="small"
            color="success"
            label={`${summary.imported.documents} documents`}
          />
          <Chip
            size="small"
            color="success"
            label={`${summary.imported.series} series`}
          />
          <Chip
            size="small"
            color="success"
            label={`${summary.imported.assets} assets`}
          />
        </Box>
      </Alert>

      {hasSkipped && (
        <Alert severity="info">
          <Typography variant="body2" fontWeight={500} gutterBottom>
            {summary.skipped.documents.length +
              summary.skipped.series.length} skipped (already exist)
          </Typography>
          {summary.skipped.documents.length > 0 && (
            <Typography variant="caption" display="block">
              Documents: {summary.skipped.documents.join(", ")}
            </Typography>
          )}
          {summary.skipped.series.length > 0 && (
            <Typography variant="caption" display="block">
              Series: {summary.skipped.series.join(", ")}
            </Typography>
          )}
        </Alert>
      )}

      {hasWarnings && (
        <Alert severity="warning" icon={<AlertTriangle />}>
          <Typography variant="body2" fontWeight={500} gutterBottom>
            {summary.warnings.length} warning
            {summary.warnings.length !== 1 ? "s" : ""}
          </Typography>
          <List dense disablePadding>
            {summary.warnings.map((w, i) => (
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

      {hasErrors && (
        <Alert severity="error" icon={<AlertCircle />}>
          <Typography variant="body2" fontWeight={500} gutterBottom>
            {summary.errors.length} error
            {summary.errors.length !== 1 ? "s" : ""}
          </Typography>
          <List dense disablePadding>
            {summary.errors.map((e, i) => (
              <ListItem key={i} disableGutters sx={{ py: 0.25 }}>
                <ListItemText
                  primary={`${e.id}: ${e.reason}`}
                  primaryTypographyProps={{ variant: "caption" }}
                />
              </ListItem>
            ))}
          </List>
        </Alert>
      )}
    </Box>
  );
};
