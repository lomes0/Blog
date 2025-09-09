import React from "react";
import { Avatar, Chip, Skeleton } from "@mui/material";
import { Edit, LibraryBooks, Person } from "@mui/icons-material";
import { DocumentStatus, Series, User } from "@/types";
import { cardTheme } from "./theme";

/**
 * Simplified post state for blog
 */
export interface PostState {
  isDraft: boolean;
  isPublished: boolean;
  isLoading: boolean;
  documentStatus?: DocumentStatus; // Add document status
}

/**
 * Create modern status chip based on post state
 */
export const createStatusChip = (postState: PostState) => {
  if (postState.isLoading) return null;

  // Only show draft status, no status chip for published posts
  if (postState.isDraft) {
    return (
      <Chip
        key="draft-chip"
        size="small"
        variant="filled"
        icon={<Edit sx={{ fontSize: 14 }} />}
        label="Draft"
        sx={{
          background: cardTheme.colors.status.draft.bg,
          borderColor: cardTheme.colors.status.draft.border,
          color: cardTheme.colors.status.draft.text,
          fontWeight: 600,
          fontSize: cardTheme.typography.metaSize,
          height: 28,

          "& .MuiChip-icon": {
            color: cardTheme.colors.status.draft.icon,
          },

          "&:hover": {
            background: cardTheme.colors.status.draft.bg,
          },
        }}
      />
    );
  }

  // No chip for published posts
  return null;
};

/**
 * Create modern author chip with enhanced design
 */
export const createAuthorChip = (author?: User | null, showAuthor = true) => {
  if (!showAuthor || !author) return null;

  return (
    <Chip
      key="author-chip"
      size="small"
      variant="filled"
      avatar={
        <Avatar
          alt={author.name ?? "User"}
          src={author.image ?? undefined}
          sx={{
            width: 22,
            height: 22,
            fontSize: "0.75rem",
            border: "2px solid white",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        >
          {!author.image && <Person sx={{ fontSize: 14 }} />}
        </Avatar>
      }
      label={author.name ?? "User"}
      sx={{
        background: cardTheme.colors.author.bg,
        borderColor: cardTheme.colors.author.border,
        color: cardTheme.colors.author.text,
        fontWeight: 500,
        fontSize: cardTheme.typography.authorSize,
        height: 32,

        "& .MuiChip-label": {
          padding: "0 8px",
          marginLeft: "6px",
        },
        "& .MuiChip-avatar": {
          marginLeft: "6px",
          marginRight: 0,
        },

        "&:hover": {
          background: cardTheme.colors.author.bg,
        },
      }}
    />
  );
};

/**
 * Create modern series chip with enhanced navigation
 */
export const createSeriesChip = (
  series?: Series | null,
  seriesOrder?: number | null,
  showSeries = true,
) => {
  if (!showSeries || !series) return null;

  const label = seriesOrder
    ? `${series.title} (#${seriesOrder})`
    : series.title;

  return (
    <Chip
      key="series-chip"
      size="small"
      variant="filled"
      icon={<LibraryBooks sx={{ fontSize: 14 }} />}
      label={label}
      onClick={() => {
        window.location.href = `/series/${series.id}`;
      }}
      sx={{
        background: cardTheme.colors.series.bg,
        borderColor: cardTheme.colors.series.border,
        color: cardTheme.colors.series.text,
        fontWeight: 600,
        fontSize: cardTheme.typography.metaSize,
        height: 28,
        cursor: "pointer",

        "& .MuiChip-icon": {
          color: cardTheme.colors.series.icon,
        },

        "&:hover": {
          background: cardTheme.colors.series.bg,
        },

        "&:active": {
          // No transform effects
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
