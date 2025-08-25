"use client";
import React, { useCallback, useMemo } from "react";
import { Box, Typography, useMediaQuery } from "@mui/material";
import { SxProps, Theme, useTheme, alpha } from "@mui/material/styles";
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

  // Simplified responsive grid for blog conventions
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.between("sm", "md"));
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  // Blog-style column calculation
  const getColumns = () => {
    if (isMobile) return 1; // Single column on mobile
    if (isTablet) return 2; // Two columns on tablet
    return isDesktop ? 3 : 2; // Three columns on desktop, fallback to 2
  };

  const columns = getColumns();
  const shouldVirtualize = items.length > virtualizationThreshold;

  // Add keyboard navigation support for accessibility
  const { gridRef } = useGridKeyboardNavigation(
    columns,
    items.length,
    (index) => {
      // Optional focus change handler
      console.log(`Focus moved to item ${index}`);
    },
  );

  // Blog-style spacing configuration
  const getSpacing = () => {
    if (isMobile) return 2;
    if (isTablet) return 3;
    return 4; // More generous spacing on desktop
  };

  const spacing = getSpacing();

  // If no items and not loading, show a clean empty state
  if (items.length === 0 && !isLoading) {
    const containerStyles = {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(4),
      width: "100%",
      maxWidth: "1200px",
      margin: "0 auto",
      padding: theme.spacing(0, 2),
      ...(sx as any),
    } as SxProps<Theme>;

    return (
      <Box sx={containerStyles}>
        {title && (
          <GridSectionHeader
            title={title}
            icon={titleIcon}
            count={0}
          />
        )}
        <Box sx={styles.emptyState}>
          {titleIcon && (
            <Box sx={styles.emptyStateIcon}>
              {titleIcon}
            </Box>
          )}
          <Typography variant="h6" sx={styles.emptyStateText}>
            No articles found
          </Typography>
          <Typography variant="body2" sx={styles.emptyStateSubtext}>
            Start writing your first article and it will appear here. Your content will be beautifully organized in this clean, blog-style layout.
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

  // Render standard grid for smaller datasets with blog-style layout
  const renderStandardGrid = () => (
    <Box sx={styles.grid}>
      <Grid
        container
        spacing={spacing}
        sx={{ 
          width: "100%",
          margin: 0,
          padding: theme.spacing(1),
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
            // Show actual items
            items.map((item, index) => (
              <Grid
                key={item.id}
                size={12 / columns} // Dynamic sizing based on column count
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
  const containerStyles = {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(4),
    width: "100%",
    maxWidth: "1200px", // Optimal reading width for blog content
    margin: "0 auto",
    padding: theme.spacing(0, 2),
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
          count={!isLoading ? items.length : undefined}
        />
      )}

      {shouldVirtualize ? renderVirtualizedGrid() : renderStandardGrid()}
    </Box>
  );
};

export default DocumentGrid;
