import React from "react";
import { Box, Card, IconButton, Skeleton, Chip } from "@mui/material";
import { MoreVert, Share } from "@mui/icons-material";
import { SxProps, Theme } from "@mui/material/styles";
import { cardTheme } from "../theme";

/**
 * Props for LoadingCard component
 */
interface LoadingCardProps {
  sx?: SxProps<Theme>;
}

/**
 * Unified loading state component that replaces PostSkeleton and PostThumbnailSkeleton
 * 
 * This component provides a consistent loading experience across
 * all parts of the card (content, metadata, actions) with all skeleton
 * logic consolidated internally.
 */
export const LoadingCard: React.FC<LoadingCardProps> = ({ sx }) => {
  return (
    <Card
      variant="outlined"
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: cardTheme.minHeight.post,
        width: "100%",
        borderRadius: cardTheme.borderRadius,
        backgroundColor: cardTheme.colors.cardBackground,
        opacity: 0.7,
        ...sx,
      }}
    >
      {/* Content skeleton */}
      <ContentSkeleton />
      
      {/* Metadata skeleton */}
      <MetaSkeleton />
      
      {/* Actions skeleton */}
      <ActionsSkeleton />
    </Card>
  );
};

/**
 * Skeleton for the main content area (replaces PostThumbnailSkeleton)
 */
const ContentSkeleton: React.FC = () => (
  <Box
    sx={{
      height: cardTheme.contentRatio.top,
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderBottom: "1px solid",
      borderColor: "divider",
      p: 2,
    }}
  >
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        alignItems: "center",
      }}
    >
      {/* Title skeleton */}
      <Skeleton
        variant="text"
        width="70%"
        height={24}
        sx={{ alignSelf: "center" }}
      />

      {/* Content lines */}
      <Skeleton variant="text" width="90%" height={16} />
      <Skeleton variant="text" width="75%" height={16} />
      <Skeleton variant="text" width="85%" height={16} />

      {/* Optional content block (table, image, etc.) */}
      <Skeleton
        variant="rectangular"
        width="100%"
        height={60}
        sx={{ mt: 1, borderRadius: 1 }}
      />
    </Box>
  </Box>
);

/**
 * Skeleton for the metadata area (replaces PostMeta loading state)
 */
const MetaSkeleton: React.FC = () => (
  <Box sx={{ p: 1.5, pb: 1 }}>
    <Box 
      sx={{ 
        display: "flex", 
        gap: 0.75, 
        overflow: "hidden",
        flexWrap: "wrap"
      }}
    >
      {/* Status chip skeleton */}
      <Skeleton
        variant="rectangular"
        width={70}
        height={24}
        sx={{ borderRadius: 12 }}
      />
      {/* Author chip skeleton */}
      <Skeleton
        variant="rectangular"
        width={90}
        height={24}
        sx={{ borderRadius: 12 }}
      />
      {/* Series chip skeleton (sometimes present) */}
      <Skeleton
        variant="rectangular"
        width={110}
        height={24}
        sx={{ borderRadius: 12 }}
      />
    </Box>
  </Box>
);

/**
 * Skeleton for the actions area (replaces PostActions loading state)
 */
const ActionsSkeleton: React.FC = () => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 0.5,
      p: 1.5,
      pt: 0,
      mt: "auto",
    }}
  >
    <IconButton aria-label="Share Post" size="small" disabled>
      <Share />
    </IconButton>
    <IconButton aria-label="Post Actions" size="small" disabled>
      <MoreVert />
    </IconButton>
  </Box>
);

export default LoadingCard;
