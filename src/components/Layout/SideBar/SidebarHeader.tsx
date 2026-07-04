"use client";
import React from "react";
import { Box, Typography } from "@mui/material";
import type { SidebarView } from "@/types";
import { SB_FONT } from "./constants";

const VIEW_TITLES: Record<SidebarView, string> = {
  explorer: "Explorer",
  search: "Search",
  notes: "Notes",
};

interface SidebarHeaderProps {
  view: SidebarView;
}

/**
 * IDE-style view-title header (e.g. "EXPLORER") shown at the top of the sidebar.
 * Uppercase, tracked, muted — the `overline` look from DESIGN.md §17.2, but
 * sized via the `SB_FONT` ladder to honor the sidebar's user font-scale
 * carve-out rather than the fixed `overline` variant.
 */
export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ view }) => (
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
      }}
    >
      {VIEW_TITLES[view]}
    </Typography>
  </Box>
);
