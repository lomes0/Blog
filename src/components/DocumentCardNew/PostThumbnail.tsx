"use client";
import { UserDocument } from "@/types";
import { memo } from "react";
import { Alert, Box, IconButton, Skeleton } from "@mui/material";
import { Refresh } from "@mui/icons-material";
import { usePostContent } from "./hooks/usePostContent";
import { cardTheme } from "./theme";

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
        className="post-thumbnail post-image"
        dangerouslySetInnerHTML={{
          __html: thumbnail
            .replaceAll("<a", "<span") // Basic link sanitization
            .replaceAll("</a", "</span")
            .replaceAll("<script", "<span") // Prevent script injection
            .replaceAll("</script", "</span"),
        }}
        sx={{
          width: "100%",
          minHeight: "240px", // Better minimum height
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",

          // Simplified image styling (no animations)
          "& img": {
            maxWidth: "100%",
            height: "auto",
            maxHeight: "180px",
            objectFit: "cover",
            borderRadius: cardTheme.image.borderRadius,
            marginBottom: 2,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          },

          // Better typography for blog content
          "& h1, & h2, & h3, & h4, & h5, & h6": {
            fontSize: cardTheme.typography.titleSize,
            fontWeight: cardTheme.typography.titleWeight,
            lineHeight: cardTheme.typography.titleLineHeight,
            color: cardTheme.colors.textPrimary,
            margin: "0 0 12px 0",
            padding: "0 16px",

            // Text overflow handling
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          },

          "& p": {
            fontSize: cardTheme.typography.excerptSize,
            lineHeight: cardTheme.typography.excerptLineHeight,
            color: cardTheme.colors.textSecondary,
            margin: "0 0 8px 0",
            padding: "0 16px",

            // Show only first paragraph with ellipsis
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          },

          // Enhanced table styling
          "& table": {
            fontSize: cardTheme.typography.metaSize,
            width: "100%",
            margin: "8px 16px",
            borderCollapse: "collapse",

            "& th, & td": {
              padding: "4px 8px",
              borderBottom: "1px solid rgba(0,0,0,0.1)",
            },
          },

          // Better list styling
          "& ul, & ol": {
            fontSize: cardTheme.typography.excerptSize,
            lineHeight: cardTheme.typography.excerptLineHeight,
            color: cardTheme.colors.textSecondary,
            margin: "0 0 12px 0",
            padding: "0 16px 0 32px",

            "& li": {
              marginBottom: "4px",
            },
          },

          // Code blocks
          "& pre, & code": {
            fontSize: "0.8rem",
            backgroundColor: "rgba(0,0,0,0.05)",
            padding: "4px 8px",
            borderRadius: "4px",
            margin: "8px 16px",
          },

          // Blockquotes
          "& blockquote": {
            borderLeft: "4px solid rgba(0,0,0,0.1)",
            margin: "12px 16px",
            padding: "8px 12px",
            fontStyle: "italic",
            color: cardTheme.colors.textSecondary,
            backgroundColor: "rgba(0,0,0,0.02)",
          },
        }}
      />
    );
  },
);

PostThumbnail.displayName = "PostThumbnail";

export default PostThumbnail;
