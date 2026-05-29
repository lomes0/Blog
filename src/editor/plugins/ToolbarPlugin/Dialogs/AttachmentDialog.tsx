"use client";
import type { LexicalEditor } from "lexical";
import { memo, useState } from "react";
import { SET_DIALOGS_COMMAND } from "./commands";
import { useTheme } from "@mui/material/styles";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { FileUp, Paperclip, Plus } from "lucide-react";
import { ANNOUNCE_COMMAND } from "@/editor/commands";
import { INSERT_ATTACHMENT_COMMAND } from "@/editor/plugins/AttachmentPlugin";
import { apiClient } from "@/api";

function AttachmentDialog({ editor }: { editor: LexicalEditor }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [blankFilename, setBlankFilename] = useState("untitled.txt");

  // Get document ID from URL (assumes format like /edit/:id, /new/:id, /view/:id, etc.)
  const getDocumentIdFromUrl = (): string | null => {
    if (typeof window === "undefined") return null;
    const pathSegments = window.location.pathname.split("/").filter(Boolean);

    // Check for routes like /edit/:id, /new/:id, /view/:id, /documents/:id
    const routeWithId = ["edit", "new", "view", "documents"];
    for (let i = 0; i < pathSegments.length - 1; i++) {
      if (routeWithId.includes(pathSegments[i])) {
        const potentialId = pathSegments[i + 1];
        // Basic UUID validation (36 chars with dashes)
        if (
          potentialId && potentialId.length === 36 && potentialId.includes("-")
        ) {
          return potentialId;
        }
      }
    }

    // Fallback: check if last segment looks like a UUID
    const lastSegment = pathSegments[pathSegments.length - 1];
    if (lastSegment && lastSegment.length === 36 && lastSegment.includes("-")) {
      return lastSegment;
    }

    return null;
  };

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
      // Get document ID from URL
      const documentId = getDocumentIdFromUrl();
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
      // Get document ID from URL
      const documentId = getDocumentIdFromUrl();
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
    <Dialog
      open
      fullScreen={fullScreen}
      onClose={handleClose}
      aria-labelledby="attachment-dialog-title"
      disableEscapeKeyDown
    >
      <DialogTitle id="attachment-dialog-title">
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Paperclip size={18} />
          Attach File
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1, minWidth: 300 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Attach any file to your post. Maximum file size: 10MB
          </Typography>

          <Button
            variant="outlined"
            fullWidth
            sx={{ my: 2, py: 2 }}
            startIcon={isUploading
              ? <CircularProgress size={20} />
              : <FileUp size={18} />}
            component="label"
            disabled={isUploading}
          >
            {selectedFile ? selectedFile.name : "Select File"}
            <input
              type="file"
              hidden
              onChange={handleFileChange}
              disabled={isUploading}
            />
          </Button>

          {selectedFile && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>File:</strong> {selectedFile.name}
              </Typography>
              <Typography variant="body2">
                <strong>Size:</strong> {(selectedFile.size / 1024).toFixed(2)}
                {" "}
                KB
              </Typography>
              <Typography variant="body2">
                <strong>Type:</strong> {selectedFile.type || "Unknown"}
              </Typography>
            </Box>
          )}

          <Divider sx={{ my: 3 }}>
            <Typography variant="body2" color="text.secondary">
              OR
            </Typography>
          </Divider>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Create a blank file to edit inline
          </Typography>

          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField
              size="small"
              fullWidth
              value={blankFilename}
              onChange={(e) => setBlankFilename(e.target.value)}
              placeholder="filename.txt"
              disabled={isUploading}
              label="Filename"
            />
            <Button
              variant="outlined"
              sx={{ minWidth: 120 }}
              startIcon={isUploading ? <CircularProgress size={20} /> : <Plus size={18} />}
              onClick={handleCreateBlank}
              disabled={!blankFilename.trim() || isUploading}
            >
              Create
            </Button>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isUploading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!selectedFile || isUploading}
          startIcon={isUploading ? <CircularProgress size={20} /> : undefined}
        >
          {isUploading ? "Uploading..." : "Attach"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default memo(AttachmentDialog);
