"use client";
import { UserDocument } from "@/types";
import { memo } from "react";
import { Box, Skeleton, Alert, IconButton } from "@mui/material";
import { Refresh } from "@mui/icons-material";
import { usePostContent } from "./hooks/usePostContent";

/**
 * Simple inline skeleton for thumbnail loading
 */
const ThumbnailSkeleton: React.FC = () => (
  <Box sx={{ p: 1 }}>
    <Skeleton variant="text" width="70%" height={24} />
    <Skeleton variant="text" width="90%" height={16} />
    <Skeleton variant="text" width="75%" height={16} />
    <Skeleton variant="rectangular" width="100%" height={60} sx={{ mt: 1 }} />
  </Box>
);

/**
 * Error display component for failed thumbnail loading
 */
const ThumbnailError: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <Box sx={{ p: 1 }}>
    <Alert 
      severity="warning" 
      action={
        <IconButton size="small" onClick={onRetry} aria-label="Retry loading">
          <Refresh />
        </IconButton>
      }
    >
      Failed to load content
    </Alert>
  </Box>
);

/**
 * Simplified post thumbnail component using usePostContent hook
 * 
 * This component now uses the consolidated content loading logic
 * with improved error handling and retry functionality.
 */
const PostThumbnail: React.FC<{ userDocument?: UserDocument }> = memo(
  ({ userDocument }) => {
    // Use the consolidated content loading hook
    const { thumbnail, isLoading, error, retry } = usePostContent(userDocument);

    // Show loading skeleton
    if (isLoading) {
      return <ThumbnailSkeleton />;
    }

    // Show error with retry option
    if (error || !thumbnail) {
      return <ThumbnailError onRetry={retry} />;
    }

    // Render the thumbnail content
    return (
      <Box
        className="post-thumbnail"
        dangerouslySetInnerHTML={{
          __html: thumbnail
            .replaceAll("<a", "<span")
            .replaceAll("</a", "</span"),
        }}
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 2,
          "& img": {
            maxWidth: "100%",
            height: "auto",
          },
          "& table": {
            fontSize: "0.75rem",
          },
          "& > *": {
            margin: "0.5rem 0",
          },
          overflow: "hidden",
        }}
      />
    );
  },
);

PostThumbnail.displayName = "PostThumbnail";

export default PostThumbnail;
