"use client";
import { useCallback, useState } from "react";
import { Save, X } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import {
  ActionButton,
  Alert,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  Spinner,
} from "../../ui";
import * as css from "./styles.css";

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
    <div className={css.editorRoot}>
      {/* Header */}
      <div className={css.editorHeader}>
        <p className={css.editorHeaderTitle}>
          Editing: {filename}
          {isDirty && " (unsaved changes)"}
        </p>
        <p className={css.editorHeaderHint}>
          Press Ctrl+S to save, Escape to cancel
        </p>
      </div>

      {/*
        The dismiss affordance is now an explicit action rather than MUI's
        `onClose` prop, which rendered its own close button inside the alert.
      */}
      {error && (
        <Alert
          variant="error"
          action={
            <ActionButton
              icon
              size="md"
              onClick={() => setError(null)}
              title="Dismiss"
              aria-label="Dismiss error"
            >
              <X size={ICON_SIZE.dense} />
            </ActionButton>
          }
        >
          {error}
        </Alert>
      )}

      {/* Editor area */}
      <div className={css.editorBody}>
        {/* Line numbers */}
        <div className={css.editorGutter}>
          {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}
          </div>)}
        </div>

        {/* Textarea */}
        <textarea
          className={css.editorTextArea}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          autoFocus
          spellCheck={false}
        />
      </div>

      {/* Footer with buttons */}
      <div className={css.editorFooter}>
        <ActionButton
          variant="outline"
          size="md"
          onClick={handleCancel}
          disabled={isSaving}
        >
          <X size={ICON_SIZE.dense} />
          Cancel
        </ActionButton>
        <ActionButton
          variant="accent"
          size="md"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
        >
          {isSaving ? <Spinner size="sm" /> : <Save size={ICON_SIZE.dense} />}
          {isSaving ? "Saving..." : "Save"}
        </ActionButton>
      </div>

      {/* Confirm dialog */}
      <Dialog
        open={showConfirmDialog}
        onOpenChange={(open) => setShowConfirmDialog(open)}
      >
        <DialogPopup showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            You have unsaved changes. Are you sure you want to discard them?
          </DialogBody>
          <DialogFooter>
            <ActionButton
              variant="outline"
              size="md"
              onClick={() => setShowConfirmDialog(false)}
            >
              Keep Editing
            </ActionButton>
            <ActionButton
              danger
              variant="outline"
              size="md"
              onClick={handleConfirmCancel}
            >
              Discard Changes
            </ActionButton>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
