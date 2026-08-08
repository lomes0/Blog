"use client";
import React from "react";
import { Box, IconButton, Tooltip } from "@mui/material";

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
 * Revealed by the row's `rowHoverRevealSx`, which both fades the button in
 * (`.row-actions-btn`) and unclips the slot it ships with (`.row-create-slot`),
 * so the button holds no width in a row nobody is pointing at. The slot is part
 * of the button rather than the call site's job because a row that forgot it
 * would look right and quietly reserve the space anyway.
 */
export const RowCreateButton: React.FC<RowCreateButtonProps> = ({
  label,
  icon,
  onClick,
}) => (
  <Box className="row-create-slot">
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
          // The button box is 18px (14px glyph + 2px padding each side) and the
          // count pill it sits above is 20px, so inset it by half the
          // difference: both then share a vertical centre line down the row's
          // right edge.
          mr: "1px",
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
  </Box>
);
