"use client";
import type { LexicalEditor } from "lexical";
import { memo, useState } from "react";
import { SET_DIALOGS_COMMAND } from "./commands";
import {
  ActionButton,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  Spinner,
  TextField,
} from "../../../ui";
import { dismissRequest, FilePickerButton } from "./parts";
import * as css from "./styles.css";
import { FileUp, Paperclip, Plus } from "lucide-react";
import { ANNOUNCE_COMMAND } from "@/editor/commands";
import { INSERT_ATTACHMENT_COMMAND } from "@/editor/plugins/AttachmentPlugin";
import { apiClient } from "@/api";
import { ICON_SIZE } from "@/theme/icons";
import { useEditorDocumentId } from "@/editor/context/DocumentContext";

function AttachmentDialog({ editor }: { editor: LexicalEditor }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [blankFilename, setBlankFilename] = useState("untitled.txt");
  // The document this editor is editing. It used to be parsed out of the
  // address bar, which named the *focused* pane's document at best and matched
  // nothing at all on a handle URL — see `EditorDocumentProvider` and
  // docs/plans/workspace-url.md §4.1.
  const documentId = useEditorDocumentId();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
    }
  };

  const closeDialog = () => {
    editor.dispatchCommand(SET_DIALOGS_COMMAND, {
      attachment: { open: false },
    });
    setSelectedFile(null);
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;

    setIsUploading(true);

    try {
      if (!documentId) {
        throw new Error("Document ID not found");
      }

      // Upload file
      const attachment = await apiClient.documents.uploadAttachment(
        documentId,
        selectedFile,
      );

      if (!attachment) throw new Error("Upload failed");

      // Insert attachment node
      const { url, filename, mimetype, size } = attachment;
      editor.dispatchCommand(INSERT_ATTACHMENT_COMMAND, {
        url,
        filename,
        mimetype,
        size,
      });

      editor.dispatchCommand(ANNOUNCE_COMMAND, {
        message: {
          title: "Attachment Added",
          subtitle: `${filename} has been attached to your post.`,
        },
      });

      closeDialog();
    } catch (error) {
      console.error("Upload error:", error);
      editor.dispatchCommand(ANNOUNCE_COMMAND, {
        message: {
          title: "Upload Failed",
          subtitle: error instanceof Error
            ? error.message
            : "Please try again later.",
        },
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreateBlank = async () => {
    setIsUploading(true);

    try {
      if (!documentId) {
        throw new Error("Document ID not found");
      }

      // Create a blank file
      const blankContent = "";
      const blob = new Blob([blankContent], { type: "text/plain" });
      const file = new File([blob], blankFilename, { type: "text/plain" });

      // Upload the blank file
      const attachment = await apiClient.documents.uploadAttachment(
        documentId,
        file,
      );

      if (!attachment) throw new Error("Upload failed");

      // Insert attachment node with editing enabled
      const { url, filename, mimetype, size } = attachment;
      editor.dispatchCommand(INSERT_ATTACHMENT_COMMAND, {
        url,
        filename,
        mimetype,
        size,
        editing: true,
        expanded: true,
      });

      editor.dispatchCommand(ANNOUNCE_COMMAND, {
        message: {
          title: "Blank Attachment Created",
          subtitle: `${filename} has been created. You can now edit it.`,
        },
      });

      closeDialog();
    } catch (error) {
      console.error("Create blank error:", error);
      editor.dispatchCommand(ANNOUNCE_COMMAND, {
        message: {
          title: "Creation Failed",
          subtitle: error instanceof Error
            ? error.message
            : "Please try again later.",
        },
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      closeDialog();
    }
  };

  return (
    <Dialog open onOpenChange={dismissRequest(handleClose)}>
      <DialogPopup fullScreen="mobile">
        <DialogHeader>
          <DialogTitle>
            <span className={css.titleRow}>
              <Paperclip size={ICON_SIZE.dense} />
              Attach File
            </span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className={css.form}>
            <p className={css.helpText}>
              Attach any file to your post. Maximum file size: 10MB
            </p>

            <FilePickerButton
              className={css.blockButton}
              disabled={isUploading}
              onFiles={handleFileChange}
            >
              {isUploading
                ? <Spinner size="sm" />
                : <FileUp size={ICON_SIZE.dense} />}
              {selectedFile ? selectedFile.name : "Select File"}
            </FilePickerButton>

            {selectedFile && (
              <div>
                <p className={css.metaText}>
                  <strong>File:</strong> {selectedFile.name}
                </p>
                <p className={css.metaText}>
                  <strong>Size:</strong>{" "}
                  {(selectedFile.size / 1024).toFixed(2)} KB
                </p>
                <p className={css.metaText}>
                  <strong>Type:</strong> {selectedFile.type || "Unknown"}
                </p>
              </div>
            )}

            <div className={css.orDivider}>OR</div>

            <p className={css.helpText}>Create a blank file to edit inline</p>

            <div className={css.inlineRow}>
              <TextField
                disabled={isUploading}
                label="Filename"
                onChange={(e) => setBlankFilename(e.target.value)}
                placeholder="filename.txt"
                rootClassName={css.grow}
                value={blankFilename}
              />
              <ActionButton
                disabled={!blankFilename.trim() || isUploading}
                onClick={handleCreateBlank}
                size="lg"
                variant="outline"
              >
                {isUploading
                  ? <Spinner size="sm" />
                  : <Plus size={ICON_SIZE.dense} />}
                Create
              </ActionButton>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <ActionButton
            disabled={isUploading}
            onClick={handleClose}
            size="lg"
            variant="outline"
          >
            Cancel
          </ActionButton>
          <ActionButton
            disabled={!selectedFile || isUploading}
            onClick={handleSubmit}
            size="lg"
            variant="accent"
          >
            {isUploading && <Spinner size="sm" />}
            {isUploading ? "Uploading..." : "Attach"}
          </ActionButton>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export default memo(AttachmentDialog);
