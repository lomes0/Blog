"use client";
import React from "react";
import { useMediaQuery } from "@mui/material";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
import ResizeGripper, { GRIPPER_W } from "../ResizeGripper";
import {
  ACTIVITY_RAIL_W,
  SIDEBAR_EDGE_TRANSITION,
  SIDEBAR_GRAB_STRIP_W,
  SIDEBAR_PANEL_ID,
} from "./constants";
import { COLLAPSE_EASING } from "./dragGeometry";

/**
 * The sidebar's drag edge, for all three modes.
 *
 * Rendered by `AppLayoutContent` rather than by the sidebar itself: in hidden
 * mode the Drawer paper is 0px wide, so a handle parented to it would have
 * nothing to hang on. Living in the layout shell means one element covers
 * full → compact → hidden and back out again, which is what makes the drag
 * symmetric — you can drag the panel shut and drag it back open.
 *
 * That is also why this one is `position: fixed` while the rail's and Copilot's
 * grippers sit inside their panels: only the state ladder is shared
 * (`ResizeGripper`), not the placement.
 *
 * It is also the mode control that does *not* require a drag. Dragging is the
 * expressive route; double-click and the arrow keys are the cheap ones, and
 * neither touches the remembered open width — they only move `mode`, which is
 * separate state precisely so that they can.
 */
const SidebarResizeHandle: React.FC = () => {
  const {
    getEffectiveWidth,
    isResizing,
    easeMs,
    startResize,
    isMobile,
    sidebarMode,
    setSidebarMode,
    stepSidebarMode,
    maxOpenWidth,
  } = useSidebarWidth();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // The mobile drawer is a temporary overlay — it is dismissed by tapping away,
  // not resized.
  if (isMobile) return null;

  const w = getEffectiveWidth();
  const closed = w <= 0;

  /**
   * Open ⇄ compact, never to hidden. Double-click is the fastest gesture on the
   * handle and hiding is the costly mistake, so the fast gesture cannot make it;
   * closing stays with the rail and Cmd+\, which are deliberate.
   */
  const handleDoubleClick = () =>
    setSidebarMode(sidebarMode === "full" ? "compact" : "full");

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Arrow keys step the mode ladder rather than nudging pixels. The three
    // modes *are* this separator's positions — the free range is a drag
    // behaviour, and a keyboard user reaching for a specific pixel width is not
    // a case worth inventing a second key gesture for.
    switch (e.key) {
      case "ArrowLeft":
        stepSidebarMode(-1);
        break;
      case "ArrowRight":
        stepSidebarMode(1);
        break;
      case "Home":
        setSidebarMode("hidden");
        break;
      case "End":
        setSidebarMode("full");
        break;
      case "Enter":
      case " ":
        handleDoubleClick();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <ResizeGripper
      isResizing={isResizing}
      onMouseDown={startResize}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      label="Resize sidebar"
      value={{
        now: w,
        min: 0,
        max: maxOpenWidth,
        text: sidebarMode === "hidden"
          ? "Hidden"
          : sidebarMode === "compact"
          ? "Compact"
          : `${Math.round(w)} pixels`,
        controls: SIDEBAR_PANEL_ID,
      }}
      transition={easeMs > 0
        // Follow the panel through the one step that animates, instead of
        // arriving ahead of it.
        ? `left ${easeMs}ms ${COLLAPSE_EASING}, width ${easeMs}ms ${COLLAPSE_EASING}`
        : isResizing || reducedMotion
        ? "none"
        : SIDEBAR_EDGE_TRANSITION}
      sx={{
        position: "fixed",
        // When closed the strip sits flush against the rail and extends right,
        // so there is something to grab at 0 width.
        left: ACTIVITY_RAIL_W + Math.max(0, w - GRIPPER_W),
        width: closed ? SIDEBAR_GRAB_STRIP_W : GRIPPER_W,
      }}
    />
  );
};

export default SidebarResizeHandle;
