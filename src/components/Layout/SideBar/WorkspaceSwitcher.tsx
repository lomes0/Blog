"use client";
import React from "react";
import { Box, Typography } from "@mui/material";
import { ChevronDown } from "lucide-react";
import { type RootState, useSelector } from "@/store";
import { ICON_SIZE } from "@/theme/icons";
import { SB_FONT } from "./constants";

/**
 * Header identity chip from the "Refined Explorer" handoff: a tinted-initial
 * chip + workspace name + chevron. Currently a **visual placeholder only** — the
 * menu / switch behavior is intentionally unwired (to be implemented later).
 *
 * Accent styling (tint chip + accent initial) is light-mode only, matching the
 * rest of the sidebar refinement; dark mode falls back to neutral tokens.
 */
export const WorkspaceSwitcher: React.FC = () => {
  const user = useSelector((state: RootState) => state.user);

  const name = user?.name ?? "Workspace";
  const initial = (user?.name?.trim()?.[0] ?? "W").toUpperCase();

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1,
        py: 0.5,
        mx: -1,
        borderRadius: 1.5,
        minWidth: 0,
        maxWidth: "100%",
        color: "text.primary",
      }}
    >
      <Box
        component="span"
        sx={{
          flexShrink: 0,
          width: 22,
          height: 22,
          // 1.5 on the ×4 `sx` scale = 6px (DESIGN.md §5).
          borderRadius: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: SB_FONT.meta,
          fontWeight: 700,
          bgcolor: "accent.tint",
          color: "accent.main",
        }}
      >
        {initial}
      </Box>
      <Typography
        component="span"
        noWrap
        sx={{
          fontSize: SB_FONT.body,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          minWidth: 0,
        }}
      >
        {name}
      </Typography>
      <Box
        component="span"
        sx={{ display: "flex", flexShrink: 0, color: "text.disabled" }}
      >
        <ChevronDown size={ICON_SIZE.inline} strokeWidth={2} />
      </Box>
    </Box>
  );
};
