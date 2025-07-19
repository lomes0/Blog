"use client";
import React, { Suspense } from "react";
import { Box, CircularProgress, Skeleton, Typography } from "@mui/material";
import { SxProps, Theme } from "@mui/material/styles";

interface LoadingStateProps {
  /** Type of loading state to display */
  variant?: "spinner" | "skeleton" | "grid" | "linear";
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
 * Centralized loading state component with multiple variants
 * for different loading scenarios throughout the application
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

interface SuspenseWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loadingProps?: LoadingStateProps;
}

/**
 * Suspense wrapper with consistent loading states
 */
export const SuspenseWrapper: React.FC<SuspenseWrapperProps> = ({
  children,
  fallback,
  loadingProps = {},
}) => {
  const defaultFallback = <LoadingState {...loadingProps} />;

  return (
    <Suspense fallback={fallback || defaultFallback}>
      {children}
    </Suspense>
  );
};

interface AsyncComponentWrapperProps {
  children: React.ReactNode;
  isLoading?: boolean;
  error?: Error | null;
  loadingProps?: LoadingStateProps;
  errorFallback?: React.ReactNode;
}

/**
 * Complete async component wrapper with loading, error, and success states
 */
export const AsyncComponentWrapper: React.FC<AsyncComponentWrapperProps> = ({
  children,
  isLoading = false,
  error = null,
  loadingProps = {},
  errorFallback,
}) => {
  if (error && errorFallback) {
    return <>{errorFallback}</>;
  }

  if (isLoading) {
    return <LoadingState {...loadingProps} />;
  }

  return <>{children}</>;
};

export default LoadingState;
