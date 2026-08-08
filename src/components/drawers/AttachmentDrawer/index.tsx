"use client";
import { useCallback } from "react";
import { Box, IconButton, SwipeableDrawer, Typography } from "@mui/material";
import { Paperclip, X } from "lucide-react";
import { actions, RootState, useDispatch, useSelector } from "@/store";
import { getLanguageDisplayName, isEditable } from "@/utils/languageDetection";
import { formatSize } from "@/utils/formatSize";
import { useAttachmentContent } from "./useAttachmentContent";
import AttachmentToolbar from "./AttachmentToolbar";
import AttachmentContentViewer from "./AttachmentContentViewer";

export default function AttachmentDrawer() {
  const dispatch = useDispatch();
  const attachmentPreview = useSelector((state: RootState) =>
    state.ui.attachmentPreview
  );

  const open = attachmentPreview?.open ?? false;
  const url = attachmentPreview?.url ?? undefined;
  const filename = attachmentPreview?.filename ?? undefined;
  const mimetype = attachmentPreview?.mimetype ?? undefined;

  const {
    language,
    contentState,
    highlightedContent,
    copied,
    isDownloading,
    fileSize,
    isEditing,
    setIsEditing,
    handleCopy,
    handleRefresh,
    handleDownload,
    handleSave,
    handleCancelEdit,
  } = useAttachmentContent({ open, url, filename, mimetype });

  const handleClose = useCallback(() => {
    dispatch(actions.closeAttachmentPreview());
  }, [dispatch]);

  const languageDisplayName = getLanguageDisplayName(language);
  const canEdit = filename ? isEditable(filename) : false;

  return (
    <SwipeableDrawer
      anchor="right"
      open={open}
      onOpen={() => {}}
      onClose={handleClose}
      sx={{ displayPrint: "none" }}
    >
      <Box
        sx={{
          width: { xs: "100vw", sm: 500, md: 600 },
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Paperclip />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" noWrap>
              {filename || "Attachment"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {languageDisplayName}
              {fileSize !== null && ` • ${formatSize(fileSize)}`}
            </Typography>
          </Box>
          <IconButton onClick={handleClose}>
            <X />
          </IconButton>
        </Box>

        {/* Toolbar */}
        <AttachmentToolbar
          canEdit={canEdit}
          hasContent={!!contentState.content}
          isEditing={isEditing}
          isLoading={contentState.loading}
          isDownloading={isDownloading}
          copied={copied}
          onCopy={handleCopy}
          onDownload={handleDownload}
          onRefresh={handleRefresh}
          onEdit={() => setIsEditing(true)}
        />

        {/* Content */}
        <AttachmentContentViewer
          loading={contentState.loading}
          error={contentState.error}
          content={contentState.content}
          highlightedContent={highlightedContent}
          language={language}
          isEditing={isEditing}
          filename={filename}
          mimetype={mimetype}
          url={url}
          onSave={handleSave}
          onCancel={handleCancelEdit}
          onRefresh={handleRefresh}
        />
      </Box>
    </SwipeableDrawer>
  );
}
