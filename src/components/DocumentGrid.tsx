import React, { useMemo } from "react";
import Grid from "@mui/material/Grid2";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { useMediaQuery } from "@mui/material";
import { User, UserDocument } from "@/types";
import DraggableDocumentCard from "./DocumentCard/DraggablePostCard";
import SkeletonCard from "./DocumentCard/components/LoadingCard";
import { SxProps, Theme } from "@mui/material/styles";
import { cardTheme } from "./DocumentCard/theme";
import { useResponsiveDocumentGrid } from "./DocumentGrid/hooks/useResponsiveDocumentGrid";
import { useDocumentGridPerformance } from "./DocumentGrid/hooks/useDocumentGridPerformance";
import DocumentGridHeader from "./DocumentGrid/DocumentGridHeader";
import DocumentGridError from "./DocumentGrid/DocumentGridError";
import DocumentGridEmpty from "./DocumentGrid/DocumentGridEmpty";

interface DocumentGridProps {
  /** The documents to display in the grid */
  items: UserDocument[];
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
            userDocument={item}
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
    if (!title) return null;

    return (
      <DocumentGridHeader
        title={title}
        titleIcon={titleIcon}
        isLoading={isLoading}
        itemCount={items.length}
      />
    );
  }, [title, titleIcon, isLoading, items.length]);

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
        <DocumentGridEmpty
          message={emptyMessage}
          actionLabel={emptyActionLabel}
          onAction={onEmptyAction}
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
        gap: 3, // Using MUI spacing scale instead of cardTheme.spacing.cardGap
        width: "100%",
        maxWidth: "100%",
        // Improved responsive spacing
        [theme.breakpoints.down("sm")]: {
          gap: 2,
        },
        ...sx,
      }}
    >
      {headerComponent}

      <Grid
        container
        spacing={{
          xs: 2,
          sm: 2.5,
          md: 3,
          lg: 3,
          xl: 3,
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
