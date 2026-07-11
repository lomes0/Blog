"use client";
import React from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { FilePlus, FolderPlus } from "lucide-react";
import type { SidebarView } from "@/types";
import { ICON_SIZE } from "@/theme/icons";
import { SB_FONT } from "./constants";

const VIEW_TITLES: Record<SidebarView, string> = {
  explorer: "Explorer",
  search: "Search",
  notes: "Notes",
};

interface SidebarHeaderProps {
  view: SidebarView;
  /** Create a new post (rendered as a trailing action in the explorer view). */
  onNewPost?: () => void;
  /** Create a new series (rendered as a trailing action in the explorer view). */
  onNewSeries?: () => void;
}

/**
 * IDE-style view-title header (e.g. "EXPLORER") shown at the top of the sidebar.
 * Uppercase, tracked, muted — the `overline` look from DESIGN.md §17.2, but
 * sized via the `SB_FONT` ladder to honor the sidebar's user font-scale
 * carve-out rather than the fixed `overline` variant.
 *
 * In the explorer view it also carries the IDE-style create actions (New Post,
 * New Series) as trailing icon buttons.
 */
export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  view,
  onNewPost,
  onNewSeries,
}) => {
  const showActions = view === "explorer" && (onNewPost || onNewSeries);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        minHeight: 36,
        px: 2,
        flexShrink: 0,
      }}
    >
      <Typography
        component="h2"
        noWrap
        sx={{
          fontSize: SB_FONT.meta,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "text.disabled",
          lineHeight: 1,
          flex: 1,
          minWidth: 0,
        }}
      >
        {VIEW_TITLES[view]}
      </Typography>

      {showActions && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, ml: 1 }}>
          {onNewPost && (
            <Tooltip title="New post" placement="bottom">
              <IconButton
                aria-label="New post"
                size="small"
                onClick={onNewPost}
                sx={{
                  p: 0.25,
                  color: "text.secondary",
                  "&:hover": { color: "text.primary", bgcolor: "action.hover" },
                }}
              >
                <FilePlus size={ICON_SIZE.inline} strokeWidth={2} />
              </IconButton>
            </Tooltip>
          )}
          {onNewSeries && (
            <Tooltip title="New series" placement="bottom">
              <IconButton
                aria-label="New series"
                size="small"
                onClick={onNewSeries}
                sx={{
                  p: 0.25,
                  color: "text.secondary",
                  "&:hover": { color: "text.primary", bgcolor: "action.hover" },
                }}
              >
                <FolderPlus size={ICON_SIZE.inline} strokeWidth={2} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
    </Box>
  );
};
