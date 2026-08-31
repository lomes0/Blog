"use client";
import React from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { ICON_SIZE } from "@/theme/icons";
import { SB_FONT } from "./constants";

/** One trailing create-action for a section header (e.g. "New note"). */
interface SectionAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface SidebarSectionHeaderProps {
  title: string;
  /** Trailing icon-button affordances, pinned to the right edge of the row. */
  actions?: SectionAction[];
}

/**
 * A tree section label ("NOTES", "PROJECTS") with its create affordances pinned
 * to the right border. Same `overline` treatment as the view header and project
 * bands (uppercase, tracked, muted — DESIGN.md §17.2), sized off the `SB_FONT`
 * ladder so it tracks the sidebar's user font-scale. Splitting the tree into
 * these labeled sections (vs. one flat list) is what gives Notes and Projects
 * their own headers + "+" buttons.
 */
export const SidebarSectionHeader: React.FC<SidebarSectionHeaderProps> = ({
  title,
  actions,
}) => {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        minHeight: 28,
        px: 2,
        mt: 1,
        mb: 0.25,
      }}
    >
      <Typography
        component="h3"
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
        {title}
      </Typography>

      {actions && actions.length > 0 && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, ml: 1 }}>
          {actions.map((action) => (
            <Tooltip key={action.key} title={action.label} placement="bottom">
              <IconButton
                aria-label={action.label}
                size="small"
                onClick={action.onClick}
                sx={{
                  p: 0.25,
                  color: "text.secondary",
                  "&:hover": {
                    color: "text.primary",
                    bgcolor: "action.hover",
                  },
                }}
              >
                {action.icon}
              </IconButton>
            </Tooltip>
          ))}
        </Box>
      )}
    </Box>
  );
};

/** Shared icon size for section-header create actions. */
export const SECTION_ACTION_ICON = ICON_SIZE.inline;
