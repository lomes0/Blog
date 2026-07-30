import React from "react";
import { Box, Card, Skeleton } from "@mui/material";

import { alpha, SxProps, Theme, useTheme } from "@mui/material/styles";
import { createCardTheme } from "../theme";

/**
 * Props for LoadingCard component
 */
interface LoadingCardProps {
  sx?: SxProps<Theme>;
}

/**
 * The card-shaped skeleton: one stand-in card, mirroring `CardBase`'s box so
 * nothing shifts when the real card swaps in. Rendered by `PostCard` while it
 * loads and by `DocumentGrid` (as `SkeletonCard`) to fill `skeletonCount`
 * slots; `DocumentBrowserSkeleton` gets it a third way, by composing
 * `DocumentGrid` — so a change here is visible on all three.
 *
 * This is the app's only card skeleton. The other loading surfaces are
 * different shapes, not variants of this one: `shared/EditorSkeleton` is a
 * static clone of the editor toolbar (no `<Skeleton>` in it at all), and
 * `DocumentBrowserSkeleton` is page chrome around this. For a plain spinner,
 * DESIGN.md §Loading says reach for MUI `<CircularProgress>` directly.
 */
const LoadingCard: React.FC<LoadingCardProps> = ({ sx }) => {
  const theme = useTheme();
  const cardTheme = createCardTheme(theme);

  // A shimmer is a contrast sweep, so it has to run the opposite direction in
  // each scheme. Keyed off grey[200]/[300] it could not: MUI's grey scale is
  // identical in both, so the band was a near-white wash — all but invisible
  // on the light card it was designed against, and only legible in dark by
  // accident. text.primary inverts with the scheme, which is the property this
  // effect actually needs.
  const shimmerStyles = {
    background: `linear-gradient(90deg,
      ${alpha(theme.palette.text.primary, 0.04)} 25%,
      ${alpha(theme.palette.text.primary, 0.1)} 50%,
      ${alpha(theme.palette.text.primary, 0.04)} 75%)`,
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
        // Must match CardBase's own radius — this is the card's stand-in while
        // it loads, so any difference pops the moment the real card swaps in.
        borderRadius: 2,
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
  shimmerStyles: SxProps<Theme>;
}

const ContentSkeleton: React.FC<SkeletonProps> = ({ shimmerStyles }) => (
  <Box
    sx={{
      height: "70%", // content preview; the remaining 30% is meta + actions
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
          borderRadius: 1,
        }}
      />

      {/* Content lines */}
      <Skeleton
        variant="text"
        width="90%"
        height={18}
        sx={{ ...shimmerStyles, borderRadius: 1 }}
      />
      <Skeleton
        variant="text"
        width="75%"
        height={18}
        sx={{ ...shimmerStyles, borderRadius: 1 }}
      />
      <Skeleton
        variant="text"
        width="85%"
        height={18}
        sx={{ ...shimmerStyles, borderRadius: 1 }}
      />

      {/* Optional content block (table, image, etc.) */}
      <Skeleton
        variant="rectangular"
        width="100%"
        height={70}
        sx={{
          mt: 1,
          borderRadius: 1,
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
          // Chips are 6px (MuiChip), not pills — the `13` here was half of the
          // 26px height, i.e. px intent fed to an sx multiple.
          borderRadius: 1.5,
          ...shimmerStyles,
        }}
      />
      {/* Author chip skeleton */}
      <Skeleton
        variant="rectangular"
        width={95}
        height={26}
        sx={{
          borderRadius: 1.5,
          ...shimmerStyles,
        }}
      />
      {/* Series chip skeleton (sometimes present) */}
      <Skeleton
        variant="rectangular"
        width={115}
        height={26}
        sx={{
          borderRadius: 1.5,
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
