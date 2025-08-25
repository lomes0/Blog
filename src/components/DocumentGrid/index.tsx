"use client";
import React, { useCallback, useMemo } from "react";
import { Box, Typography, useMediaQuery } from "@mui/material";
import { alpha, SxProps, Theme, useTheme } from "@mui/material/styles";
import { User, UserDocument } from "@/types";
import { AutoSizer, List, WindowScroller } from "react-virtualized";
import Grid from "@mui/material/Grid2";
import DraggableDocumentCard from "../DocumentCard/DraggablePostCard";
import SkeletonCard from "../DocumentCard/components/LoadingCard";
import GridSectionHeader from "./GridSectionHeader";
import { documentGridStyles } from "./styles";
import useGridKeyboardNavigation from "./useGridKeyboardNavigation";

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
  /** Whether to use virtualization for large item sets */
  virtualized?: boolean;
  /** Optional threshold for enabling virtualization */
  virtualizationThreshold?: number;
}

/**
 * A reusable grid component for displaying documents or directories
 * with consistent spacing, responsive behavior, and performance optimizations
 */
const DocumentGrid: React.FC<DocumentGridProps> = ({
  items,
  user,
  title,
  titleIcon,
  sx,
  onMoveComplete,
  isLoading = false,
  skeletonCount = 6, // Better for blog layouts
  virtualized = true,
  virtualizationThreshold = 50, // Higher threshold for better UX
}) => {
  const theme = useTheme();
  const styles = documentGridStyles(theme);

  // Blog-oriented responsive grid calculation
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.between("sm", "lg"));
  const isDesktop = useMediaQuery(theme.breakpoints.up("lg"));

  // Blog-style column calculation with better spacing
  const getColumns = () => {
    if (isMobile) return 1; // Single column for mobile reading
    if (isTablet) return 2; // Two columns for tablets
    return 3; // Three columns for desktop blog layout
  };

  const columns = getColumns();
  const shouldVirtualize = items.length > virtualizationThreshold;

  // Blog-focused spacing that adapts to content density
  const getSpacing = () => {
    if (isMobile) return 5; // More generous mobile spacing
    if (isTablet) return 6; // More generous tablet spacing
    return 8; // Much more generous desktop spacing for better visual separation
  };

  const spacing = getSpacing();

  // Add keyboard navigation support for accessibility
  const { gridRef } = useGridKeyboardNavigation(
    columns,
    items.length,
    (index) => {
      // Optional focus change handler for accessibility
      console.log(`Focus moved to item ${index}`);
    },
  );

  // If no items and not loading, show a blog-oriented empty state
  if (items.length === 0 && !isLoading) {
    const containerStyles = {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(6),
      width: "100%",
      maxWidth: "1400px",
      margin: "0 auto",
      padding: theme.spacing(0, 3),
      [theme.breakpoints.down("md")]: {
        padding: theme.spacing(0, 2),
        gap: theme.spacing(4),
      },
      ...(sx as any),
    } as SxProps<Theme>;

    return (
      <Box sx={containerStyles}>
        {title && (
          <GridSectionHeader
            title={title}
            icon={titleIcon}
          />
        )}
        <Box sx={styles.emptyState}>
          {titleIcon && (
            <Box sx={styles.emptyStateIcon}>
              {titleIcon}
            </Box>
          )}
          <Typography variant="h5" sx={styles.emptyStateText}>
            No articles published yet
          </Typography>
          <Typography variant="body1" sx={styles.emptyStateSubtext}>
            Start writing your first article and share your thoughts with the
            world. Your published content will appear here in a beautiful,
            magazine-style layout.
          </Typography>
        </Box>
      </Box>
    );
  }

  // Render the grid with virtualization for large datasets
  const renderVirtualizedGrid = () => (
    <WindowScroller>
      {({ height, isScrolling, registerChild, scrollTop }) => (
        <AutoSizer disableHeight>
          {({ width }) => {
            const itemsPerRow = columns;
            const rowCount = Math.ceil(items.length / itemsPerRow);
            const calculatedRowHeight = 400; // Fixed card height for blog layout

            return (
              <div ref={(element) => registerChild(element)}>
                <List
                  autoHeight
                  height={height || calculatedRowHeight * rowCount}
                  isScrolling={isScrolling}
                  rowCount={rowCount}
                  rowHeight={calculatedRowHeight}
                  scrollTop={scrollTop}
                  width={width}
                  rowRenderer={({ index, key, style }) => {
                    const fromIndex = index * itemsPerRow;
                    const toIndex = Math.min(
                      fromIndex + itemsPerRow,
                      items.length,
                    );

                    return (
                      <div key={key} style={style}>
                        <Grid container spacing={spacing} sx={styles.gridRow}>
                          {Array.from({ length: itemsPerRow }).map(
                            (_, colIndex) => {
                              const itemIndex = fromIndex + colIndex;
                              if (itemIndex >= items.length) return null;

                              return (
                                <Grid
                                  key={items[itemIndex].id}
                                  size={12 / columns} // Dynamic sizing based on column count
                                >
                                  <DraggableDocumentCard
                                    userDocument={items[itemIndex]}
                                    user={user}
                                    onMoveComplete={onMoveComplete}
                                    sx={styles.card}
                                  />
                                </Grid>
                              );
                            },
                          )}
                        </Grid>
                      </div>
                    );
                  }}
                />
              </div>
            );
          }}
        </AutoSizer>
      )}
    </WindowScroller>
  );

  // Render standard grid with blog-oriented layout
  const renderStandardGrid = () => (
    <Box sx={styles.grid}>
      <Grid
        container
        spacing={spacing}
        sx={{
          width: "100%",
          margin: 0,
          alignItems: "stretch", // Ensure equal height cards
        }}
      >
        {isLoading
          ? (
            // Show skeleton cards when loading
            Array.from({ length: skeletonCount }).map((_, index) => (
              <Grid
                key={`skeleton-${index}`}
                size={12 / columns} // Dynamic sizing based on column count
              >
                <Box sx={styles.skeletonCard}>
                  <SkeletonCard />
                </Box>
              </Grid>
            ))
          )
          : (
            // Show actual blog posts
            items.map((item, index) => (
              <Grid
                key={item.id}
                size={12 / columns} // Dynamic sizing based on column count
                sx={{
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <DraggableDocumentCard
                  userDocument={item}
                  user={user}
                  onMoveComplete={onMoveComplete}
                  sx={styles.card}
                />
              </Grid>
            ))
          )}
      </Grid>
    </Box>
  );

  // Create a merged style object safely for TypeScript with blog-focused layout
  // Create blog-oriented container styles
  const containerStyles = {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(6), // More generous spacing
    width: "100%",
    maxWidth: "1400px", // Wider for better desktop experience
    margin: "0 auto",
    padding: theme.spacing(0, 3), // More padding
    [theme.breakpoints.down("md")]: {
      padding: theme.spacing(0, 2),
      gap: theme.spacing(4),
    },
    ...(sx as any),
  } as SxProps<Theme>;

  return (
    <Box
      sx={containerStyles}
      ref={gridRef}
      role="grid"
      aria-label={title || "Document grid"}
    >
      {title && (
        <GridSectionHeader
          title={title}
          icon={titleIcon}
        />
      )}

      {shouldVirtualize ? renderVirtualizedGrid() : renderStandardGrid()}
    </Box>
  );
};

export default DocumentGrid;
