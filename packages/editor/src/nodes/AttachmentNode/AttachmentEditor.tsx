"use client";
import { useCallback, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography,
} from "@mui/material";
import { Save, X } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";

interface AttachmentEditorProps {
  initialContent: string;
  filename: string;
  mimetype: string;
  language?: string;
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
}

export default function AttachmentEditor({
  initialContent,
  filename,
  language: _language,
  onSave,
  onCancel,
}: AttachmentEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const isDirty = content !== initialContent;

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);

    try {
      await onSave(content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setIsSaving(false);
    }
  }, [content, onSave]);

  const handleCancel = useCallback(() => {
    if (isDirty) {
      setShowConfirmDialog(true);
    } else {
      onCancel();
    }
  }, [isDirty, onCancel]);

  const handleConfirmCancel = useCallback(() => {
    setShowConfirmDialog(false);
    onCancel();
  }, [onCancel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Cmd/Ctrl + S to save
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!isSaving) {
          handleSave();
        }
      }
      // Escape to cancel
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSave, handleCancel, isSaving],
  );

  // Count lines for line number display
  const lineCount = content.split("\n").length;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1,
          bgcolor: "warning.light",
          color: "warning.contrastText",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="body2" fontWeight="medium">
          Editing: {filename}
          {isDirty && " (unsaved changes)"}
        </Typography>
        <Typography variant="caption">
          Press Ctrl+S to save, Escape to cancel
        </Typography>
      </Box>

      {/* Error display */}
      {error && (
        <Alert
          severity="error"
          onClose={() => setError(null)}
          sx={{ borderRadius: 0 }}
        >
          {error}
        </Alert>
      )}

      {/* Editor area */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Line numbers */}
        <Box
          sx={{
            width: 50,
            // grey.* does not flip with the color scheme — see the note in
            // AttachmentComponent. action.selected is the scheme-aware tint.
            bgcolor: "action.selected",
            borderRight: 1,
            borderColor: "divider",
            overflow: "hidden",
            py: 1,
            px: 0.5,
            fontFamily: "monospace",
            fontSize: "0.85rem",
            lineHeight: 1.5,
            color: "text.secondary",
            textAlign: "right",
            userSelect: "none",
          }}
        >
          {Array.from(
            { length: lineCount },
            (_, i) => <Box key={i}>{i + 1}</Box>,
          )}
        </Box>

        {/* Textarea */}
        <Box
          component="textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          sx={{
            flex: 1,
            p: 1,
            m: 0,
            border: "none",
            outline: "none",
            resize: "none",
            fontFamily: "monospace",
            fontSize: "0.85rem",
            lineHeight: 1.5,
            // `background.input` is this theme's field surface (#ffffff light /
            // #363f52 dark), so the textarea stays lifted above the panel in
            // both schemes rather than pinned to grey.50's fixed #fafafa.
            bgcolor: "background.input",
            color: "text.primary",
            overflow: "auto",
            "&:focus": {
              outline: "none",
            },
            "&:disabled": {
              bgcolor: "action.disabledBackground",
              color: "text.disabled",
            },
          }}
          autoFocus
          spellCheck={false}
        />
      </Box>

      {/* Footer with buttons */}
      <Box
        sx={{
          p: 1,
          borderTop: 1,
          borderColor: "divider",
          display: "flex",
          gap: 1,
          justifyContent: "flex-end",
          bgcolor: "background.paper",
        }}
      >
        <Button
          variant="outlined"
          color="inherit"
          onClick={handleCancel}
          disabled={isSaving}
          startIcon={<X size={ICON_SIZE.dense} />}
          size="small"
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
          startIcon={isSaving
            ? <CircularProgress size={16} />
            : <Save size={ICON_SIZE.dense} />}
          size="small"
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </Box>

      {/* Confirm dialog */}
      <Dialog
        open={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
      >
        <DialogTitle>Discard changes?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved changes. Are you sure you want to discard them?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowConfirmDialog(false)}>
            Keep Editing
          </Button>
          <Button onClick={handleConfirmCancel} color="error">
            Discard Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
