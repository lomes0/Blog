"use client";
import React from "react";
import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { MOTION } from "@/theme/tokens";

/** Resting thickness of a drag edge. */
export const GRIPPER_W = 4;

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
 */
const ResizeGripper: React.FC<ResizeGripperProps> = ({
  onMouseDown,
  isResizing,
  label,
  transition,
  sx,
}) => (
  <Box
    role="separator"
    aria-orientation="vertical"
    aria-label={label}
    onMouseDown={onMouseDown}
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
      },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  />
);

export default ResizeGripper;
