"use client";
import React from "react";
import { Box, Button, Paper, Typography } from "@mui/material";
import { CreateNewFolder, Folder, PostAdd } from "@mui/icons-material";

interface EmptyStateProps {
  directoryId?: string; // Keep for compatibility but unused
  domainInfo?: any; // Keep for compatibility but unused
  onCreateDocument: () => void;
  onCreateDirectory: () => void; // Keep for compatibility but unused
}

/**
 * Empty state component shown when no blog posts are found
 * Provides quick action to create a new post
 */
const EmptyState: React.FC<EmptyStateProps> = ({
  directoryId,
  domainInfo,
  onCreateDocument,
  onCreateDirectory,
}) => {
  // In blog structure, we always show the same empty state
  const getEmptyStateContent = () => {
    return {
      icon: (
        <PostAdd
          sx={{
            width: 64,
            height: 64,
            color: "text.secondary",
            opacity: 0.6,
          }}
        />
      ),
      title: "No blog posts yet",
      description: "Create your first blog post to get started",
    };
  };

  const { icon, title, description } = getEmptyStateContent();

  return (
    <Paper
      elevation={0}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        p: 6,
        gap: 2,
        borderRadius: 2,
        border: "1px dashed",
        borderColor: "divider",
        bgcolor: "background.default",
      }}
    >
      {icon}
      <Typography variant="h6">{title}</Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        align="center"
      >
        {description}
      </Typography>
      <Box sx={{ mt: 2 }}>
        <Button
          variant="contained"
          startIcon={<PostAdd />}
          onClick={onCreateDocument}
          sx={{ borderRadius: 1.5 }}
        >
          New Post
        </Button>
      </Box>
    </Paper>
  );
};

export default EmptyState;
