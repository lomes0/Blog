import React from "react";
import NextLink from "next/link";
import { Chip } from "@mui/material";
import { BookOpen, Pencil } from "lucide-react";
import { DocumentStatus, Series } from "@/types";
import { createCardTheme } from "./theme";
import { ICON_SIZE } from "@/theme/icons";

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
        icon={<Pencil size={ICON_SIZE.inline} />}
        label="Draft"
        sx={(theme) => {
          const ct = createCardTheme(theme);
          return {
            background: ct.colors.status.draft.bg,
            borderColor: ct.colors.status.draft.border,
            color: ct.colors.status.draft.text,
            fontWeight: 600,
            fontSize: ct.typography.metaSize,
            height: 28,
            "& .MuiChip-icon": { color: ct.colors.status.draft.icon },
            "&:hover": { background: ct.colors.status.draft.bg },
          };
        }}
      />
    );
  }

  // No chip for published posts
  return null;
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
      component={NextLink}
      href={`/posts/${series.id}`}
      size="small"
      variant="filled"
      clickable
      icon={<BookOpen size={ICON_SIZE.inline} />}
      label={label}
      sx={(theme) => {
        const ct = createCardTheme(theme);
        return {
          background: ct.colors.series.bg,
          borderColor: ct.colors.series.border,
          color: ct.colors.series.text,
          fontWeight: 600,
          fontSize: ct.typography.metaSize,
          height: 28,
          textDecoration: "none",
          "& .MuiChip-icon": { color: ct.colors.series.icon },
          "&:hover": { background: ct.colors.series.bg },
        };
      }}
    />
  );
};
