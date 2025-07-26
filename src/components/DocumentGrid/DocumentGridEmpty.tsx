import React from "react";
import { Box, Button, Typography } from "@mui/material";
import { Add, FolderOpen } from "@mui/icons-material";

interface DocumentGridEmptyProps {
  /** Custom empty message */
  message?: string;
  /** Custom description */
  description?: string;
  /** Optional action button */
  actionLabel?: string;
  /** Action button click handler */
  onAction?: () => void;
  /** Icon to display */
  icon?: React.ReactNode;
}

/**
 * Empty state component for DocumentGrid
 * Displayed when there are no items to show
 */
const DocumentGridEmpty: React.FC<DocumentGridEmptyProps> = ({
  message = "No documents found",
  description = "Get started by creating your first document or folder.",
  actionLabel = "Create Document",
  onAction,
  icon = <FolderOpen sx={{ fontSize: 48, color: "text.secondary" }} />,
}) => {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: 8,
        px: 3,
        textAlign: "center",
        minHeight: 300,
      }}
    >
      <Box sx={{ mb: 3 }}>
        {icon}
      </Box>

      <Typography
        variant="h6"
        sx={{
          mb: 1,
          fontWeight: 500,
          color: "text.primary",
        }}
      >
        {message}
      </Typography>

      <Typography
        variant="body2"
        sx={{
          mb: 3,
          color: "text.secondary",
          maxWidth: 400,
          lineHeight: 1.6,
        }}
      >
        {description}
      </Typography>

      {onAction && (
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={onAction}
          sx={{
            minWidth: 140,
          }}
        >
          {actionLabel}
        </Button>
      )}
    </Box>
  );
};

export default DocumentGridEmpty;
