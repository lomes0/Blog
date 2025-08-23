"use client";
import React, { useCallback, useMemo } from "react";
import { Box, Typography, useMediaQuery } from "@mui/material";
import { SxProps, Theme, useTheme } from "@mui/material/styles";
import { User, UserDocument } from "@/types";
import { AutoSizer, List, WindowScroller } from "react-virtualized";
import Grid from "@mui/material/Grid2";
import DraggableDocumentCard from "../DocumentCard/DraggableDocumentCard";
import SkeletonCard from "../DocumentCard/SkeletonCard";
import GridSectionHeader from "./GridSectionHeader";
import { documentGridStyles } from "./styles";
import { useResponsiveGrid, useVirtualization } from "./hooks";
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
  skeletonCount = 4,
  virtualized = true,
  virtualizationThreshold = 20,
}) => {
  const theme = useTheme();
  const styles = documentGridStyles(theme);

  // Use our custom hooks for responsive grid layout
  const { columns, rowHeight } = useResponsiveGrid();
  const { shouldVirtualize } = useVirtualization(items.length, {
    threshold: virtualizationThreshold,
    forceVirtualize: virtualized && items.length > virtualizationThreshold * 2,
  });

  // Add keyboard navigation support for accessibility
  const { gridRef } = useGridKeyboardNavigation(
    columns,
    items.length,
    (index) => {
      // Optional focus change handler
      console.log(`Focus moved to item ${index}`);
    },
  );

  // If no items and not loading, show a message instead of nothing
  if (items.length === 0 && !isLoading) {
    // Create a merged style object safely for TypeScript
    const containerStyles = {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(2),
      width: "100%",
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
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            py: 6,
            color: "text.secondary",
          }}
        >
          {titleIcon && (
            <Box sx={{ fontSize: 48, opacity: 0.5, mb: 2 }}>
              {titleIcon}
            </Box>
          )}
          <Typography variant="body1">No items found</Typography>
        </Box>
      </Box>
    );
  }

  // Render the grid with virtualization for better performance with large datasets
  const renderVirtualizedGrid = () => (
    <WindowScroller>
      {({ height, isScrolling, registerChild, scrollTop }) => (
        <AutoSizer disableHeight>
          {({ width }) => {
            const itemsPerRow = columns;
            const rowCount = Math.ceil(items.length / itemsPerRow);
            const calculatedRowHeight = rowHeight(340); // Card height + margin

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
                        <Grid container spacing={3} sx={styles.gridRow}>
                          {Array.from({ length: itemsPerRow }).map(
                            (_, colIndex) => {
                              const itemIndex = fromIndex + colIndex;
                              if (itemIndex >= items.length) return null;

                              return (
                                <Grid
                                  key={items[itemIndex].id}
                                  size={{
                                    xs: 12,
                                    sm: 6,
                                    md: 4,
                                    lg: 3,
                                    xl: 2.4,
                                  }}
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

  // Render standard grid for smaller datasets
  const renderStandardGrid = () => (
    <Grid
      container
      spacing={3}
      sx={styles.grid}
    >
      {isLoading
        ? (
          // Show skeleton cards when loading
          Array.from({ length: skeletonCount }).map((_, index) => (
            <Grid
              key={`skeleton-${index}`}
              size={{
                xs: 12,
                sm: 6,
                md: 4,
                lg: 3,
                xl: 2.4,
              }}
            >
              <SkeletonCard sx={styles.skeletonCard} />
            </Grid>
          ))
        )
        : (
          // Show actual items
          items.map((item) => (
            <Grid
              key={item.id}
              size={{
                xs: 12,
                sm: 6,
                md: 4,
                lg: 3,
                xl: 2.4,
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
  );

  // Create a merged style object safely for TypeScript
  const containerStyles = {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(2),
    width: "100%",
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
