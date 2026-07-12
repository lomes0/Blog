"use client";
import React from "react";
import { Box } from "@mui/material";
import { MONO_FONT, SB_ACCENT, SB_FONT } from "./constants";

interface CountPillProps {
  /** Number to display (e.g. a folder's post count). */
  count: number;
  /** Whether the owning row is selected — switches to the accent pill. */
  active?: boolean;
}

/**
 * Trailing count badge for folder rows, from the "Refined Explorer" handoff:
 * a rounded mono pill. Light mode uses the handoff's neutral (`SB_ACCENT.pillBg`)
 * / accent (`SB_ACCENT.pillActiveBg`) fills; dark mode falls back to the app's
 * neutral action tokens until the dark palette is derived ("dark later").
 */
export const CountPill: React.FC<CountPillProps> = ({ count, active }) => (
  <Box
    component="span"
    sx={(theme) => ({
      flexShrink: 0,
      minWidth: 20,
      textAlign: "center",
      px: 0.75,
      py: "1px",
      borderRadius: "6px",
      fontFamily: MONO_FONT,
      fontSize: SB_FONT.meta,
      fontWeight: 500,
      lineHeight: 1.5,
      bgcolor: "action.hover",
      color: "text.disabled",
      ...theme.applyStyles("light", {
        backgroundColor: SB_ACCENT.pillBg,
        color: SB_ACCENT.pillText,
      }),
      ...(active &&
        theme.applyStyles("light", {
          backgroundColor: SB_ACCENT.pillActiveBg,
          color: SB_ACCENT.activeText,
        })),
    })}
  >
    {count}
  </Box>
);
