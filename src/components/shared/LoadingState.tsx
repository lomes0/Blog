"use client";
import React from "react";
import { Box, CircularProgress, Skeleton, Typography } from "@mui/material";
import { SxProps, Theme } from "@mui/material/styles";

interface LoadingStateProps {
  /** Type of loading state to display */
  variant?: "spinner" | "skeleton" | "content" | "grid" | "linear";
  /** Size of the loading indicator */
  size?: "small" | "medium" | "large";
  /** Custom message to display */
  message?: string;
  /** Whether to show the message */
  showMessage?: boolean;
  /** Custom styles */
  sx?: SxProps<Theme>;
  /** Height for skeleton variants */
  height?: string | number;
  /** Number of skeleton items for grid variant */
  count?: number;
}

/**
 * Generic loading primitives (Level 1 – primitive).
 *
 * Loading-state hierarchy:
 *   Level 1 – LoadingState            : generic spinner / skeleton primitives  ← you are here
 *   Level 2 – DocumentCard/LoadingCard : card-shaped skeleton (domain)
 *   Level 3 – DocumentBrowserSkeleton : page-level skeleton for DocumentBrowser
 *   Level 3 – DocumentBrowserSkeleton : page-level skeleton for DocumentBrowser
 *
 * Use this component for any in-component loading that doesn't need a
 * card- or page-shaped skeleton. Higher-level skeletons (Levels 2 & 3)
 * may compose this or render MUI primitives directly when layout fidelity
 * requires it.
 */
export const LoadingState: React.FC<LoadingStateProps> = ({
  variant = "spinner",
  size = "medium",
  message = "Loading...",
  showMessage = true,
  sx,
  height = 200,
  count = 4,
}) => {
  const getSize = () => {
    switch (size) {
      case "small":
        return 24;
      case "medium":
        return 40;
      case "large":
        return 60;
      default:
        return 40;
    }
  };

  const renderContent = () => {
    switch (variant) {
      case "spinner":
        return (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              p: 4,
              minHeight: height,
              ...sx,
            }}
          >
            <CircularProgress size={getSize()} />
            {showMessage && (
              <Typography variant="body2" color="text.secondary">
                {message}
              </Typography>
            )}
          </Box>
        );

      case "skeleton":
        return (
          <Box sx={{ p: 2, ...sx }}>
            <Skeleton variant="text" height={40} sx={{ mb: 2 }} />
            <Skeleton variant="rectangular" height={height} sx={{ mb: 1 }} />
            <Skeleton variant="text" height={20} width="60%" />
          </Box>
        );

      case "content":
        return (
          <Box sx={{ p: 1, ...sx }}>
            <Skeleton variant="text" width="70%" height={24} />
            <Skeleton variant="text" width="90%" height={16} />
            <Skeleton variant="text" width="75%" height={16} />
            <Skeleton
              variant="rectangular"
              width="100%"
              height={60}
              sx={{ mt: 1 }}
            />
          </Box>
        );

      case "grid":
        return (
          <Box sx={{ p: 2, ...sx }}>
            {Array.from({ length: count }).map((_, index) => (
              <Box key={index} sx={{ mb: 2 }}>
                <Skeleton
                  variant="rectangular"
                  height={height}
                  sx={{
                    borderRadius: 1,
                    mb: 1,
                  }}
                />
                <Skeleton variant="text" height={24} width="80%" />
                <Skeleton variant="text" height={20} width="60%" />
              </Box>
            ))}
          </Box>
        );

      case "linear":
        return (
          <Box
            sx={{
              width: "100%",
              p: 2,
              ...sx,
            }}
          >
            <Skeleton variant="text" height={60} sx={{ mb: 2 }} />
            <Skeleton variant="text" height={20} sx={{ mb: 1 }} />
            <Skeleton variant="text" height={20} sx={{ mb: 1 }} />
            <Skeleton variant="text" height={20} width="70%" />
          </Box>
        );

      default:
        return null;
    }
  };

  return renderContent();
};
