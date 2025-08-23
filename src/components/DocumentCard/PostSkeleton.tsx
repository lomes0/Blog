"use client";
import React from "react";
import { Box, Card, Chip, Skeleton } from "@mui/material";
import { SxProps, Theme } from "@mui/material/styles";
import { cardTheme } from "./theme";

/**
 * Simplified skeleton for PostCard loading state
 * Consolidates multiple skeleton components into one
 */
interface PostSkeletonProps {
  sx?: SxProps<Theme>;
}

const PostSkeleton: React.FC<PostSkeletonProps> = ({ sx }) => {
  return (
    <Card
      variant="outlined"
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: cardTheme.minHeight.post,
        maxWidth: cardTheme.maxWidth,
        width: "100%",
        ...sx,
        borderRadius: cardTheme.borderRadius,
        backgroundColor: cardTheme.colors.cardBackground,
        opacity: 0.7,
      }}
    >
      {/* Top content skeleton */}
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
          <Skeleton variant="text" width="60%" height={28} />
          <Skeleton variant="text" width="80%" height={16} />
          <Skeleton variant="text" width="70%" height={16} />
          <Skeleton variant="rectangular" width="90%" height={60} />
        </Box>
      </Box>

      {/* Bottom section skeleton */}
      <Box
        sx={{
          height: cardTheme.contentRatio.bottom,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Title area */}
        <Box
          sx={{
            px: cardTheme.spacing.contentPadding,
            py: cardTheme.spacing.titleMargin,
            flexGrow: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Skeleton variant="text" width="75%" height={24} />
        </Box>

        {/* Action bar */}
        <Box
          sx={{
            px: cardTheme.spacing.contentPadding,
            py: 1.5,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid",
            borderColor: "divider",
            height: cardTheme.actionBar.height,
          }}
        >
          {/* Chip skeletons */}
          <Box sx={{ display: "flex", gap: 1 }}>
            <Chip
              size="small"
              variant="outlined"
              label={<Skeleton variant="text" width={60} />}
            />
            <Chip
              size="small"
              variant="outlined"
              label={<Skeleton variant="text" width={80} />}
            />
          </Box>

          {/* Action button skeletons */}
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <Skeleton variant="circular" width={32} height={32} />
            <Skeleton variant="circular" width={32} height={32} />
          </Box>
        </Box>
      </Box>
    </Card>
  );
};

export default PostSkeleton;
