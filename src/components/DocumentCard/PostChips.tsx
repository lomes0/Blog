import React from "react";
import { Avatar, Chip, Skeleton } from "@mui/material";
import { LibraryBooks, Edit, Public } from "@mui/icons-material";
import { Series, User } from "@/types";
import { cardTheme } from "./theme";

/**
 * Simplified post state for blog
 */
export interface PostState {
  isDraft: boolean;
  isPublished: boolean;
  isLoading: boolean;
}

/**
 * Create status chip based on post state
 */
export const createStatusChip = (postState: PostState) => {
  if (postState.isLoading) return null;

  if (postState.isDraft) {
    return (
      <Chip
        key="draft-chip"
        size="small"
        variant="outlined"
        icon={<Edit />}
        label="Draft"
        sx={{
          bgcolor: cardTheme.colors.status.draft.bg,
          borderColor: cardTheme.colors.status.draft.border,
          color: cardTheme.colors.status.draft.text,
          fontWeight: "bold",
        }}
      />
    );
  }

  if (postState.isPublished) {
    return (
      <Chip
        key="published-chip"
        size="small"
        variant="outlined"
        icon={<Public />}
        label="Published"
        sx={{
          bgcolor: cardTheme.colors.status.published.bg,
          borderColor: cardTheme.colors.status.published.border,
          color: cardTheme.colors.status.published.text,
          fontWeight: "bold",
        }}
      />
    );
  }

  return null;
};

/**
 * Create author chip with avatar
 */
export const createAuthorChip = (author?: User | null, showAuthor = true) => {
  if (!showAuthor || !author) return null;

  return (
    <Chip
      key="author-chip"
      size="small"
      variant="outlined"
      avatar={
        <Avatar
          alt={author.name ?? "User"}
          src={author.image ?? undefined}
          sx={{ width: 20, height: 20 }}
        />
      }
      label={author.name ?? "User"}
      sx={{
        "& .MuiChip-label": {
          padding: "0 4px",
          marginLeft: "4px",
        },
        "& .MuiChip-avatar": {
          marginLeft: "4px",
          marginRight: 0,
        },
      }}
    />
  );
};

/**
 * Create series chip with navigation
 */
export const createSeriesChip = (
  series?: Series | null,
  seriesOrder?: number | null,
  showSeries = true
) => {
  if (!showSeries || !series) return null;

  const label = seriesOrder 
    ? `${series.title} (#${seriesOrder})` 
    : series.title;

  return (
    <Chip
      key="series-chip"
      size="small"
      variant="outlined"
      icon={<LibraryBooks />}
      label={label}
      onClick={() => {
        window.location.href = `/series/${series.id}`;
      }}
      sx={{
        bgcolor: cardTheme.colors.series.bg,
        borderColor: cardTheme.colors.series.border,
        color: cardTheme.colors.series.text,
        fontWeight: "bold",
        cursor: "pointer",
        "&:hover": {
          bgcolor: cardTheme.colors.series.bg,
          opacity: 0.8,
        },
      }}
    />
  );
};

/**
 * Render all post chips
 */
export const renderPostChips = ({
  postState,
  author,
  series,
  seriesOrder,
  showAuthor = true,
  showSeries = true,
}: {
  postState: PostState;
  author?: User | null;
  series?: Series | null;
  seriesOrder?: number | null;
  showAuthor?: boolean;
  showSeries?: boolean;
}) => {
  if (postState.isLoading) {
    return renderSkeletonChips();
  }

  const chips = [
    createStatusChip(postState),
    createSeriesChip(series, seriesOrder, showSeries),
    createAuthorChip(author, showAuthor),
  ].filter(Boolean);

  return <>{chips}</>;
};

/**
 * Render loading skeleton chips
 */
export const renderSkeletonChips = (count = 2) => {
  const skeletonChips = Array.from({ length: count }).map((_, index) => (
    <Chip
      key={`skeleton-chip-${index}`}
      size="small"
      variant="outlined"
      label={<Skeleton variant="text" width={index === 0 ? 60 : 80} />}
      sx={{
        "& .MuiChip-label": {
          padding: "0 4px",
        },
      }}
    />
  ));

  return <>{skeletonChips}</>;
};
