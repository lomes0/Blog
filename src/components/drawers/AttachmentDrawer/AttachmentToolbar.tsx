"use client";
import { Box, CircularProgress, IconButton } from "@mui/material";
import { Copy, Download, Pencil, RefreshCw } from "lucide-react";

interface AttachmentToolbarProps {
  canEdit: boolean;
  hasContent: boolean;
  isEditing: boolean;
  isLoading: boolean;
  isDownloading: boolean;
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
  onRefresh: () => void;
  onEdit: () => void;
}

export default function AttachmentToolbar({
  canEdit,
  hasContent,
  isEditing,
  isLoading,
  isDownloading,
  copied,
  onCopy,
  onDownload,
  onRefresh,
  onEdit,
}: AttachmentToolbarProps) {
  return (
    <Box
      sx={{
        p: 1,
        borderBottom: 1,
        borderColor: "divider",
        display: "flex",
        gap: 1,
      }}
    >
      <IconButton
        size="small"
        onClick={onCopy}
        disabled={!hasContent || isEditing}
        title={copied ? "Copied!" : "Copy to clipboard"}
      >
        <Copy size={18} />
      </IconButton>
      <IconButton
        size="small"
        onClick={onDownload}
        disabled={isDownloading || isEditing}
        title="Download file"
      >
        {isDownloading
          ? <CircularProgress size={18} />
          : <Download size={18} />}
      </IconButton>
      <IconButton
        size="small"
        onClick={onRefresh}
        disabled={isLoading || isEditing}
        title="Refresh content"
      >
        <RefreshCw size={18} />
      </IconButton>
      {canEdit && (
        <IconButton
          size="small"
          onClick={onEdit}
          disabled={!hasContent || isEditing}
          title="Edit file"
          color={isEditing ? "primary" : "default"}
        >
          <Pencil size={18} />
        </IconButton>
      )}
    </Box>
  );
}
