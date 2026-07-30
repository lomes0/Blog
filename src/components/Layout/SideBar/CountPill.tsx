"use client";
import React from "react";
import { Box } from "@mui/material";
import { MONO_FONT, SB_FONT } from "./constants";

interface CountPillProps {
  /** Number to display (e.g. a folder's post count). */
  count: number;
  /** Whether the owning row is selected — switches to the accent pill. */
  active?: boolean;
}

/**
 * Trailing count badge for folder rows, from the "Refined Explorer" handoff:
 * a rounded mono pill. Both fills come from `palette.accent`, so the selected
 * state now reads in dark mode too — it previously had a light-only tint and
 * rendered identically whether the row was selected or not.
 */
export const CountPill: React.FC<CountPillProps> = ({ count, active }) => (
  <Box
    component="span"
    sx={{
      flexShrink: 0,
      minWidth: 20,
      textAlign: "center",
      px: 0.75,
      py: "1px",
      // 1.5 on the ×4 `sx` scale = 6px, DESIGN.md §5's canonical chip radius.
      borderRadius: 1.5,
      fontFamily: MONO_FONT,
      fontSize: SB_FONT.meta,
      fontWeight: 500,
      lineHeight: 1.5,
      bgcolor: active ? "accent.pillActiveBg" : "accent.pillBg",
      color: active ? "accent.activeText" : "accent.pillText",
    }}
  >
    {count}
  </Box>
);
