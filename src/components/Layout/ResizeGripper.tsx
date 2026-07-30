"use client";
import React from "react";
import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { FOCUS_RING, MOTION } from "@/theme/tokens";

/** Resting thickness of a drag edge. */
export const GRIPPER_W = 4;

/**
 * The `separator` half of the ARIA window-splitter pattern. Supply all four
 * together or none: a valued separator with no `aria-valuenow` announces as an
 * ordinary divider, and one that is operable by keyboard must be in the tab
 * order to say so.
 */
export interface GripperValue {
  now: number;
  min: number;
  max: number;
  /** Read instead of the raw number — "Compact" beats "76". */
  text: string;
  /** Id of the pane this separator sizes. */
  controls: string;
}

interface ResizeGripperProps {
  /** Start the drag — pass the owning panel's `startResize`. */
  onMouseDown: (e: React.MouseEvent) => void;
  /** Whether this panel is being dragged right now (drives the lit state). */
  isResizing: boolean;
  /** Announced to assistive tech, e.g. "Resize Copilot panel". */
  label: string;
  /**
   * Transition while at rest. Defaults to the colour fade below; the sidebar
   * passes a compound one because its edge also slides on programmatic mode
   * changes. Ignored during a drag, which must track the cursor exactly.
   */
  transition?: string;
  /**
   * Make the separator keyboard-operable: adds it to the tab order, gives it a
   * visible focus state, and announces its position. Omit on a gripper that is
   * pointer-only.
   */
  value?: GripperValue;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  /** Position/size overrides. The default is the panel's own left edge. */
  sx?: SxProps<Theme>;
}

/**
 * The drag edge shared by all three resizable panels.
 *
 * It was written three times — twice byte-identical (right rail, Copilot) and
 * once with a different position and the only `role="separator"` of the three.
 * DESIGN.md §17.3 wants one interaction vocabulary for chrome; a divider you can
 * grab is chrome, so the rest/hover/active/dragging ladder lives here rather
 * than in each panel: invisible at rest, a half-strength `primary` wash on
 * hover, full `primary` while held or dragging.
 *
 * Focus is the fourth rung and is deliberately *louder* than §17.3's ring alone:
 * a 2px ring around a 4px transparent strip is not a visible focus indicator, so
 * a focused gripper also paints itself, the way a hovered one does. The ring
 * still carries the "this is focused, not merely hovered" distinction.
 */
const ResizeGripper: React.FC<ResizeGripperProps> = ({
  onMouseDown,
  isResizing,
  label,
  transition,
  value,
  onKeyDown,
  onDoubleClick,
  sx,
}) => (
  <Box
    role="separator"
    aria-orientation="vertical"
    aria-label={label}
    {...(value && {
      tabIndex: 0,
      "aria-valuenow": Math.round(value.now),
      "aria-valuemin": value.min,
      "aria-valuemax": value.max,
      "aria-valuetext": value.text,
      "aria-controls": value.controls,
    })}
    onMouseDown={onMouseDown}
    onKeyDown={onKeyDown}
    onDoubleClick={onDoubleClick}
    sx={[
      {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: GRIPPER_W,
        cursor: "col-resize",
        zIndex: 1300,
        displayPrint: "none",
        backgroundColor: isResizing ? "primary.main" : "transparent",
        transition: isResizing
          ? "none"
          : transition ?? `background-color ${MOTION.base}ms ${MOTION.easing}`,
        "&:hover": { backgroundColor: "primary.main", opacity: 0.5 },
        "&:active": { backgroundColor: "primary.main", opacity: 1 },
        "&:focus-visible": {
          outline: "none",
          backgroundColor: "primary.main",
          opacity: 1,
          boxShadow: FOCUS_RING.chrome,
        },
      },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  />
);

export default ResizeGripper;
