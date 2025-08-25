import React from "react";
import { Box, Card, Chip, IconButton, Skeleton } from "@mui/material";
import { MoreVert, Share } from "@mui/icons-material";
import { alpha, SxProps, Theme, useTheme } from "@mui/material/styles";
import { cardTheme } from "../theme";

/**
 * Props for LoadingCard component
 */
interface LoadingCardProps {
  sx?: SxProps<Theme>;
}

/**
 * Enhanced unified loading state component with improved shimmer animations
 *
 * This component provides a consistent loading experience across
 * all parts of the card (content, metadata, actions) with sophisticated
 * skeleton animations and better visual hierarchy.
 */
export const LoadingCard: React.FC<LoadingCardProps> = ({ sx }) => {
  const theme = useTheme();

  const shimmerStyles = {
    background: `linear-gradient(90deg, 
      ${alpha(theme.palette.grey[300], 0.1)} 25%, 
      ${alpha(theme.palette.grey[200], 0.3)} 50%, 
      ${alpha(theme.palette.grey[300], 0.1)} 75%)`,
    backgroundSize: "200% 100%",
    animation: "shimmer 1.8s ease-in-out infinite",
    "@keyframes shimmer": {
      "0%": {
        backgroundPosition: "-200% 0",
      },
      "100%": {
        backgroundPosition: "200% 0",
      },
    },
  };

  return (
    <Card
      variant="outlined"
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: cardTheme.minHeight.post,
        width: "100%",
        borderRadius: cardTheme.borderRadius + 4,
        backgroundColor: cardTheme.colors.cardBackground,
        border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
        overflow: "hidden",
        position: "relative",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: "-100%",
          width: "100%",
          height: "100%",
          background: `linear-gradient(90deg, transparent, ${
            alpha(theme.palette.common.white, 0.3)
          }, transparent)`,
          animation: "sweep 2s ease-in-out infinite",
          zIndex: 1,
        },
        "@keyframes sweep": {
          "0%": {
            left: "-100%",
          },
          "100%": {
            left: "100%",
          },
        },
        ...sx,
      }}
    >
      {/* Content skeleton */}
      <ContentSkeleton shimmerStyles={shimmerStyles} />

      {/* Metadata skeleton */}
      <MetaSkeleton shimmerStyles={shimmerStyles} />

      {/* Actions skeleton */}
      <ActionsSkeleton shimmerStyles={shimmerStyles} />
    </Card>
  );
};

/**
 * Skeleton for the main content area with enhanced shimmer animation
 */
interface SkeletonProps {
  shimmerStyles: any;
}

const ContentSkeleton: React.FC<SkeletonProps> = ({ shimmerStyles }) => (
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
      position: "relative",
      zIndex: 0,
    }}
  >
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        alignItems: "center",
      }}
    >
      {/* Title skeleton */}
      <Skeleton
        variant="text"
        width="70%"
        height={28}
        sx={{
          alignSelf: "center",
          ...shimmerStyles,
          borderRadius: 4,
        }}
      />

      {/* Content lines */}
      <Skeleton
        variant="text"
        width="90%"
        height={18}
        sx={{ ...shimmerStyles, borderRadius: 3 }}
      />
      <Skeleton
        variant="text"
        width="75%"
        height={18}
        sx={{ ...shimmerStyles, borderRadius: 3 }}
      />
      <Skeleton
        variant="text"
        width="85%"
        height={18}
        sx={{ ...shimmerStyles, borderRadius: 3 }}
      />

      {/* Optional content block (table, image, etc.) */}
      <Skeleton
        variant="rectangular"
        width="100%"
        height={70}
        sx={{
          mt: 1,
          borderRadius: 6,
          ...shimmerStyles,
        }}
      />
    </Box>
  </Box>
);

/**
 * Skeleton for the metadata area with enhanced animations
 */
const MetaSkeleton: React.FC<SkeletonProps> = ({ shimmerStyles }) => (
  <Box sx={{ p: 1.5, pb: 1, position: "relative", zIndex: 0 }}>
    <Box
      sx={{
        display: "flex",
        gap: 1,
        overflow: "hidden",
        flexWrap: "wrap",
      }}
    >
      {/* Status chip skeleton */}
      <Skeleton
        variant="rectangular"
        width={75}
        height={26}
        sx={{
          borderRadius: 13,
          ...shimmerStyles,
        }}
      />
      {/* Author chip skeleton */}
      <Skeleton
        variant="rectangular"
        width={95}
        height={26}
        sx={{
          borderRadius: 13,
          ...shimmerStyles,
        }}
      />
      {/* Series chip skeleton (sometimes present) */}
      <Skeleton
        variant="rectangular"
        width={115}
        height={26}
        sx={{
          borderRadius: 13,
          ...shimmerStyles,
        }}
      />
    </Box>
  </Box>
);

/**
 * Skeleton for the actions area with subtle animations
 */
const ActionsSkeleton: React.FC<SkeletonProps> = ({ shimmerStyles }) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 1,
      p: 1.5,
      pt: 0,
      mt: "auto",
      position: "relative",
      zIndex: 0,
    }}
  >
    <Skeleton
      variant="circular"
      width={32}
      height={32}
      sx={{ ...shimmerStyles }}
    />
    <Skeleton
      variant="circular"
      width={32}
      height={32}
      sx={{ ...shimmerStyles }}
    />
  </Box>
);

export default LoadingCard;
