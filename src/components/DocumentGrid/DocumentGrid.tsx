import React, { useMemo } from "react";
import Grid from "@mui/material/Grid2";
import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import { useMediaQuery } from "@mui/material";
import { User, Post } from "@/types";
import DraggableDocumentCard from "../DocumentCard/DraggablePostCard";
import SkeletonCard from "../DocumentCard/components/LoadingCard";
import { SxProps, Theme } from "@mui/material/styles";
import { createCardTheme } from "../DocumentCard/theme";
import { useResponsiveDocumentGrid } from "./hooks/useResponsiveDocumentGrid";
import { useDocumentGridPerformance } from "./hooks/useDocumentGridPerformance";
import DocumentGridError from "./DocumentGridError";
import { EmptyState } from "@/components/shared/EmptyState";

interface DocumentGridProps {
  /** The documents to display in the grid */
  items: Post[];
  /** The current user */
  user?: User;
  /** Optional title to display above the grid */
  title?: string;
  /** Optional icon to display beside the title */
  titleIcon?: React.ReactNode;
  /** Optional additional styles */
  sx?: SxProps<Theme>;
  /** Optional callback when a document is moved */
  onMoveComplete?: () => void;
  /** Whether the grid is in a loading state */
  isLoading?: boolean;
  /** Number of skeleton cards to show when loading */
  skeletonCount?: number;
  /** Error state */
  error?: Error | string | null;
  /** Retry function for error state */
  onRetry?: () => void;
  /** Show empty state when no items */
  showEmptyState?: boolean;
  /** Custom empty state message */
  emptyMessage?: string;
  /** Empty state action button label */
  emptyActionLabel?: string;
  /** Empty state action callback */
  onEmptyAction?: () => void;
}

/**
 * A highly optimized, responsive grid component for displaying documents and directories
 *
 * Features:
 * - Responsive grid layout with intelligent column distribution
 * - Performance optimized with comprehensive memoization
 * - Accessibility compliant with ARIA labels and semantic HTML
 * - Error handling with retry functionality
 * - Empty state management with customizable actions
 * - Loading states with skeleton placeholders
 * - Motion preference respect for better UX
 * - Development performance monitoring
 *
 * @example
 * ```tsx
 * <DocumentGrid
 *   items={documents}
 *   user={currentUser}
 *   title="My Documents"
 *   titleIcon={<Folder />}
 *   isLoading={loading}
 *   error={error}
 *   onRetry={() => refetch()}
 *   onEmptyAction={() => createDocument()}
 * />
 * ```
 */
const DocumentGrid: React.FC<DocumentGridProps> = ({
  items,
  user,
  title,
  titleIcon,
  sx,
  onMoveComplete,
  isLoading = false,
  skeletonCount = 4,
  error,
  onRetry,
  showEmptyState = true,
  emptyMessage,
  emptyActionLabel,
  onEmptyAction,
}) => {
  const theme = useTheme();
  const cardTheme = useMemo(() => createCardTheme(theme), [theme]);
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );

  // Use the custom hook for responsive grid calculations
  const { gridSizing } = useResponsiveDocumentGrid();

  // Performance monitoring in development
  useDocumentGridPerformance(items.length, "DocumentGrid");

  // Memoize skeleton items to prevent unnecessary re-renders
  const skeletonItems = useMemo(
    () =>
      Array.from(
        { length: skeletonCount },
        (_, index) => (
          <Grid key={`skeleton-${index}`} size={gridSizing}>
            <SkeletonCard
              sx={{
                height: "100%",
                ...(prefersReducedMotion && { animation: "none" }),
              }}
            />
          </Grid>
        ),
      ),
    [skeletonCount, gridSizing, prefersReducedMotion],
  );

  // Memoize rendered items for performance
  const renderedItems = useMemo(
    () =>
      items.map((item) => (
        <Grid key={item.id} size={gridSizing}>
          <DraggableDocumentCard
            post={item}
            user={user}
            onMoveComplete={onMoveComplete}
            sx={{
              height: "100%",
              transition: prefersReducedMotion
                ? "none"
                : theme.transitions.create([
                  "transform",
                  "box-shadow",
                ], {
                  duration: theme.transitions.duration.standard,
                  easing: theme.transitions.easing.easeInOut,
                }),
            }}
          />
        </Grid>
      )),
    [
      items,
      user,
      onMoveComplete,
      gridSizing,
      prefersReducedMotion,
      theme,
    ],
  );

  // Memoize the header component
  const headerComponent = useMemo(() => {
    if (!title && !titleIcon) return null;

    return (
      <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
        {titleIcon && (
          <Box
            sx={{
              mr: 1.5,
              color: "primary.main",
              display: "flex",
              alignItems: "center",
            }}
          >
            {titleIcon}
          </Box>
        )}
      </Box>
    );
  }, [title, titleIcon]);

  // Handle error state
  if (error) {
    return (
      <Box
        component="section"
        role="region"
        aria-label={title ? `${title} grid error` : "Document grid error"}
        sx={{ ...sx }}
      >
        {headerComponent}
        <DocumentGridError error={error} onRetry={onRetry} />
      </Box>
    );
  }

  // Handle empty state (when not loading and no items)
  if (!isLoading && items.length === 0) {
    if (!showEmptyState) return null;

    return (
      <Box
        component="section"
        role="region"
        aria-label={title ? `${title} grid empty` : "Document grid empty"}
        sx={{ ...sx }}
      >
        {headerComponent}
        <EmptyState
          title={emptyMessage ?? "No documents found"}
          description="Get started by creating your first document or folder."
          action={onEmptyAction
            ? {
              label: emptyActionLabel ?? "Create Document",
              onClick: onEmptyAction,
            }
            : undefined}
        />
      </Box>
    );
  }

  return (
    <Box
      component="section"
      role="region"
      aria-label={title ? `${title} grid` : "Document grid"}
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: cardTheme.spacing.cardGap, // Use enhanced theme spacing
        width: "100%",
        maxWidth: "100%",
        // Enhanced responsive spacing for blog layout
        [theme.breakpoints.down("md")]: {
          gap: cardTheme.spacing.cardGap * 0.75,
        },
        [theme.breakpoints.down("sm")]: {
          gap: cardTheme.spacing.cardGap * 0.5,
        },
        ...sx,
      }}
    >
      {headerComponent}

      <Grid
        container
        spacing={{
          xs: cardTheme.spacing.cardGap,
          sm: cardTheme.spacing.cardGap * 1.25,
          md: cardTheme.spacing.cardGap * 1.5,
          lg: cardTheme.spacing.cardGap * 1.75,
          xl: cardTheme.spacing.cardGap * 2,
        }}
        sx={{
          width: "100%",
          maxWidth: "100%",
          marginTop: 0,
          // Ensure consistent alignment
          alignItems: "stretch",
          // Performance optimization for large grids
          contain: "layout style",
        }}
      >
        {isLoading ? skeletonItems : renderedItems}
      </Grid>
    </Box>
  );
};

export default DocumentGrid;
