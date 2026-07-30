"use client";
import React from "react";
import { Box, useMediaQuery } from "@mui/material";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
import {
  ACTIVITY_RAIL_W,
  SIDEBAR_EDGE_TRANSITION,
  SIDEBAR_GRAB_STRIP_W,
} from "./constants";

/** Resting thickness of the edge handle. */
const HANDLE_W = 4;

/**
 * The sidebar's drag edge, for all three modes.
 *
 * Rendered by `AppLayoutContent` rather than by the sidebar itself: in hidden
 * mode the Drawer paper is 0px wide, so a handle parented to it would have
 * nothing to hang on. Living in the layout shell means one element covers
 * full → compact → hidden and back out again, which is what makes the drag
 * symmetric — you can drag the panel shut and drag it back open.
 *
 * Position is driven off the live effective width, so it tracks the cursor
 * during a drag and rides the settle spring afterwards. The CSS transition is
 * only for *programmatic* mode changes (activity rail, Cmd+\), where there is no
 * spring to follow and the handle would otherwise jump ahead of the panel.
 */
export const SidebarResizeHandle: React.FC = () => {
  const {
    getEffectiveWidth,
    isResizing,
    isAnimating,
    startResize,
    isMobile,
  } = useSidebarWidth();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // The mobile drawer is a temporary overlay — it is dismissed by tapping away,
  // not resized.
  if (isMobile) return null;

  const w = getEffectiveWidth();
  const closed = w <= 0;

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label={closed
        ? "Show sidebar (drag right)"
        : "Resize sidebar (drag to collapse)"}
      onMouseDown={startResize}
      sx={{
        position: "fixed",
        top: 0,
        bottom: 0,
        // When closed the strip sits flush against the rail and extends right,
        // so there is something to grab at 0 width.
        left: ACTIVITY_RAIL_W + Math.max(0, w - HANDLE_W),
        width: closed ? SIDEBAR_GRAB_STRIP_W : HANDLE_W,
        cursor: "col-resize",
        zIndex: 1300,
        displayPrint: "none",
        backgroundColor: isResizing ? "primary.main" : "transparent",
        transition: isResizing || isAnimating || reducedMotion
          ? "none"
          : SIDEBAR_EDGE_TRANSITION,
        "&:hover": { backgroundColor: "primary.main", opacity: 0.5 },
        "&:active": { backgroundColor: "primary.main", opacity: 1 },
      }}
    />
  );
};

export default SidebarResizeHandle;
