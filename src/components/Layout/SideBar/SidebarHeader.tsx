"use client";
import React from "react";
import { Box, Typography } from "@mui/material";
import type { SidebarView } from "@/types";
import { SB_FONT } from "./constants";
import { CHROME_BAR_H } from "@/theme/tokens";

const VIEW_TITLES: Record<SidebarView, string> = {
  explorer: "Explorer",
  search: "Search",
  notes: "Notes",
};

interface SidebarHeaderProps {
  view: SidebarView;
}

/**
 * IDE-style view-title header (e.g. "SEARCH") shown at the top of the sidebar.
 * Uppercase, tracked, muted — the `overline` look from DESIGN.md §17.2, but
 * sized via the `SB_FONT` ladder to honor the sidebar's user font-scale
 * carve-out rather than the fixed `overline` variant.
 *
 * It used to carry the New Post / New Series buttons as well, behind a
 * `view === "explorer"` guard — but the explorer never rendered this header, so
 * those were unreachable. Creation belongs to the tree's own section headers
 * ("Notes", "Projects"), which is where a "+" can name the container it creates
 * into; this is a title again.
 */
export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ view }) => {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        minHeight: CHROME_BAR_H,
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
    </Box>
  );
};
