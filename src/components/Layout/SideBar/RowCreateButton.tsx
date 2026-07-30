"use client";
import React from "react";
import { IconButton, Tooltip } from "@mui/material";

interface RowCreateButtonProps {
  /** Tooltip and accessible name, e.g. "New post in series". */
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

/**
 * The "+" on a container row — a new post in a series, a new series in a
 * project.
 *
 * It sits inside a row that is itself clickable and draggable, and every one of
 * those behaviours would misfire on the way to the button: a click would toggle
 * the container shut, a double-click would open its rename, and a press-and-move
 * would start dragging the row. So it stops all three rather than leaving each
 * container row to remember to.
 *
 * Revealed by the row's `rowHoverRevealSx` via `.row-actions-btn`, and by its
 * own `focus-visible` so it stays reachable without a pointer (DESIGN.md §9).
 */
export const RowCreateButton: React.FC<RowCreateButtonProps> = ({
  label,
  icon,
  onClick,
}) => (
  <Tooltip title={label} placement="right">
    <IconButton
      className="row-actions-btn"
      aria-label={label}
      size="small"
      draggable={false}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      sx={{
        p: 0.25,
        ml: 0.25,
        // Cancel the button's own right padding so the glyph's edge lines up
        // with the post-row actions below it.
        mr: -0.25,
        flexShrink: 0,
        opacity: 0,
        transition: "opacity 0.15s",
        color: "text.secondary",
        "&:hover": { color: "text.primary", bgcolor: "action.hover" },
        "&:focus-visible": { opacity: 1 },
      }}
    >
      {icon}
    </IconButton>
  </Tooltip>
);
