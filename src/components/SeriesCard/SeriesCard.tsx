"use client";
import * as React from "react";
import { memo, useMemo } from "react";
import { SxProps, Theme } from "@mui/material/styles";
import { IconButton, Skeleton, Chip, Box } from "@mui/material";
import { MoreVert, Folder, Article } from "@mui/icons-material";
import { Series, User } from "@/types";
import CardBase from "../DocumentCard/CardBase";
import { cardTheme } from "../DocumentCard/theme";

// Define proper interface for component props
interface SeriesCardProps {
  /** The series data */
  series?: Series;
  /** The current user */
  user?: User;
  /** Additional styles to apply */
  sx?: SxProps<Theme>;
  /** Card configuration */
  cardConfig?: {
    /** Min height of the card */
    minHeight?: string;
    /** Whether to show the author chip */
    showAuthor?: boolean;
    /** Max number of status chips to display */
    maxStatusChips?: number;
    /** Whether to show the sort order chip */
    showSortOrder?: boolean;
    /** Whether to show permission chips (published, collab, private) */
    showPermissionChips?: boolean;
  };
}

/**
 * Series card component representing a series in the system
 * Optimized for performance and accessibility
 */
const SeriesCard: React.FC<SeriesCardProps> = memo(({
  series,
  user,
  sx,
  cardConfig = {},
}) => {
  // Apply default configuration with overrides
  const config = useMemo(() => ({
    minHeight: cardConfig.minHeight || cardTheme.minHeight.document,
    showAuthor: cardConfig.showAuthor !== false,
    maxStatusChips: cardConfig.maxStatusChips,
    showSortOrder: cardConfig.showSortOrder !== false,
    showPermissionChips: cardConfig.showPermissionChips !== false,
  }), [cardConfig]);

  // Navigation and metadata
  const href = series ? `/series/${series.id}` : "/";
  
  // Rendering helpers
  const isLoading = !series;

  // Memoize top content (series icon)
  const topContent = useMemo(
    () => (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "140px",
          backgroundColor: "primary.light",
          borderRadius: 1,
          color: "white",
        }}
      >
        <Folder sx={{ fontSize: 64 }} />
      </Box>
    ),
    [series],
  );

  // Memoize chip content based on series data
  const chipContent = useMemo(() => {
    if (isLoading) {
      return (
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          <Skeleton variant="rectangular" width={60} height={24} sx={{ borderRadius: 1 }} />
          <Skeleton variant="rectangular" width={80} height={24} sx={{ borderRadius: 1 }} />
        </Box>
      );
    }

    const chips = [];
    
    // Post count chip
    if (series) {
      chips.push(
        <Chip
          key="post-count"
          label={`${series.posts?.length || 0} posts`}
          size="small"
          variant="outlined"
          icon={<Article />}
          sx={{ fontSize: "0.7rem" }}
        />
      );
    }
    
    // Author chip
    if (config.showAuthor && series?.author) {
      chips.push(
        <Chip
          key="author"
          label={series.author.name}
          size="small"
          variant="outlined"
          sx={{ fontSize: "0.7rem" }}
        />
      );
    }

    return (
      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
        {chips}
      </Box>
    );
  }, [
    isLoading,
    series,
    config.showAuthor,
  ]);

  // Memoize action content for better performance
  const actionContent = useMemo(() => {
    if (isLoading) {
      return (
        <IconButton
          aria-label="Series Actions"
          size="small"
          disabled
        >
          <MoreVert />
        </IconButton>
      );
    }

    // For now, simple action menu - can be expanded later
    return (
      <IconButton
        aria-label="Series Actions"
        size="small"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // TODO: Implement series action menu
        }}
      >
        <MoreVert />
      </IconButton>
    );
  }, [isLoading, series, user]);

  // Memoize title content
  const titleContent = useMemo(() => {
    return series?.title || <Skeleton variant="text" width={190} />;
  }, [series?.title]);

  // Memoize aria label for better accessibility
  const ariaLabel = useMemo(() => {
    return series ? `Open ${series.title} series` : "Loading series";
  }, [series]);

  return (
    <CardBase
      title={titleContent}
      href={href}
      isLoading={isLoading}
      topContent={topContent}
      chipContent={chipContent}
      actionContent={actionContent}
      minHeight={config.minHeight}
      className="series-card"
      ariaLabel={ariaLabel}
      sx={sx}
      contentProps={{
        showSubheaderSpace: false,
      }}
    />
  );
});

// Set display name for debugging purposes
SeriesCard.displayName = "SeriesCard";

export default SeriesCard;
