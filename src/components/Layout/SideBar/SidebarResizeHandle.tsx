"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
import ResizeGripper, { GRIPPER_W } from "../ResizeGripper";
import {
  type PreviewOrigin,
  SidebarDragPreview,
} from "./SidebarDragPreview";
import {
  ACTIVITY_RAIL_W,
  SIDEBAR_EDGE_TRANSITION,
  SIDEBAR_GRAB_STRIP_W,
  SIDEBAR_PANEL_ID,
} from "./constants";
import {
  clamp,
  type Geometry,
  type Landing,
  landingCommit,
  nextLanding,
} from "./dragGeometry";

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
 * ── The drag is deferred ──────────────────────────────────────────────────
 * Holding this handle does not resize anything. The panel's width is frozen for
 * the whole gesture and `SidebarDragPreview` draws the destination instead; the
 * width is written once, on release. So the loop below owns no width state, only
 * refs, and a fast drag across the full range produces exactly two React renders
 * — one to raise the preview, one to drop it — with nothing but `transform`
 * writes in between. Lag is not tuned out of this interaction, it is unavailable
 * to it: there is no layout in the loop to be slow.
 *
 * This is also the mode control that does *not* require a drag. Dragging is the
 * expressive route; double-click and the arrow keys are the cheap ones. They
 * apply directly, with no preview and with the ordinary slide — they are not
 * gestures, and there is no pointer for a guide line to follow.
 */
const SidebarResizeHandle: React.FC = () => {
  const {
    sidebarWidth,
    sidebarMode,
    minOpenWidth,
    maxOpenWidth,
    openWidth,
    noWidthMotion,
    commitResize,
    setSidebarMode,
    stepSidebarMode,
    isMobile,
  } = useSidebarWidth();

  // The gesture, as refs. State would mean a render per frame, which is the one
  // thing this design is built to avoid; `origin` is the sole exception, and it
  // changes once at each end of the drag rather than within it.
  const [origin, setOrigin] = useState<PreviewOrigin | null>(null);
  const activeRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const landingRef = useRef<Landing>({ mode: "full", width: 0 });
  /** The capturing element and pointer, so Escape can let go mid-gesture. */
  const captureRef = useRef<{ el: Element; id: number } | null>(null);
  /**
   * Sampled at pointer-down. Reading `innerWidth` per frame would force the
   * layout the whole gesture is built to skip.
   */
  const guideMaxRef = useRef(0);

  const guideRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const edgeRef = useRef<HTMLDivElement | null>(null);

  // Mirrored so the move handler reads current bounds without being rebuilt —
  // and so `end` stays stable across the gesture that installed it.
  const geomRef = useRef<Geometry>({ min: 0, max: 0, openWidth: 0 });
  geomRef.current = { min: minOpenWidth, max: maxOpenWidth, openWidth };

  const end = useCallback((commit: boolean) => {
    // Idempotent: a normal release ends the drag on `pointerup` and then fires
    // `lostpointercapture` right behind it, and Escape ends it before either.
    if (!activeRef.current) return;
    activeRef.current = false;

    const capture = captureRef.current;
    captureRef.current = null;
    if (capture?.el.hasPointerCapture(capture.id)) {
      capture.el.releasePointerCapture(capture.id);
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";

    // Dropping the preview and applying the width are one React update, so the
    // panel is never seen without its outline or the outline without its panel.
    if (commit) commitResize(landingCommit(landingRef.current, geomRef.current));
    setOrigin(null);
  }, [commitResize]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Secondary buttons open menus and paste; neither is a resize.
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    captureRef.current = { el: e.currentTarget, id: e.pointerId };

    const from = sidebarWidth;
    startXRef.current = e.clientX;
    startWidthRef.current = from;
    landingRef.current = { mode: sidebarMode, width: from };
    guideMaxRef.current = window.innerWidth - ACTIVITY_RAIL_W;
    activeRef.current = true;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setOrigin({ raw: from, width: from });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeRef.current) return;
    const raw = startWidthRef.current + (e.clientX - startXRef.current);

    // The outline moves only when the destination does — `nextLanding` returns
    // its argument by reference through the dead band and the pinned snap
    // positions, so those frames touch no DOM at all.
    const landing = nextLanding(
      raw,
      landingRef.current,
      geomRef.current,
      e.altKey,
    );
    if (landing !== landingRef.current) {
      landingRef.current = landing;
      if (fillRef.current) {
        fillRef.current.style.transform = `scaleX(${landing.width})`;
      }
      if (edgeRef.current) {
        edgeRef.current.style.transform = `translateX(${landing.width}px)`;
      }
    }

    // The guide follows the raw pointer, unsnapped: the gap it opens against the
    // outline is how a zone announces itself. Clamped only to stay on screen —
    // past `max` the pointer keeps moving while the outline stops, and that is
    // exactly what says there is a ceiling.
    if (guideRef.current) {
      const x = clamp(raw, 0, guideMaxRef.current);
      guideRef.current.style.transform = `translateX(${x}px)`;
    }
  };

  // Escape abandons the gesture: the preview goes, the panel never moved, and
  // nothing is written. Bound to the window rather than the handle because the
  // pointer holds capture but focus may be anywhere.
  useEffect(() => {
    if (!origin) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      end(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [origin, end]);

  // Unmounting mid-drag (the mobile breakpoint is the way that happens) would
  // otherwise leave the page stuck with a resize cursor and no selection.
  useEffect(() => () => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  // The mobile drawer is a temporary overlay — it is dismissed by tapping away,
  // not resized.
  if (isMobile) return null;

  const closed = sidebarWidth <= 0;

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
    <>
      <ResizeGripper
        isResizing={origin !== null}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => end(true)}
        onPointerCancel={() => end(false)}
        onLostPointerCapture={() => end(false)}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        label="Resize sidebar"
        value={{
          now: sidebarWidth,
          min: 0,
          max: maxOpenWidth,
          text: sidebarMode === "hidden"
            ? "Hidden"
            : sidebarMode === "compact"
            ? "Compact"
            : `${Math.round(sidebarWidth)} pixels`,
          controls: SIDEBAR_PANEL_ID,
        }}
        // The handle sits at the panel's edge and the panel does not move during
        // a drag, so there is nothing to follow and nothing to suppress until
        // the release — which lands instantly, with the panel.
        transition={noWidthMotion ? "none" : SIDEBAR_EDGE_TRANSITION}
        sx={{
          position: "fixed",
          // When closed the strip sits flush against the rail and extends right,
          // so there is something to grab at 0 width.
          left: ACTIVITY_RAIL_W + Math.max(0, sidebarWidth - GRIPPER_W),
          width: closed ? SIDEBAR_GRAB_STRIP_W : GRIPPER_W,
        }}
      />
      {
        /* Not gated on `prefers-reduced-motion`: the preview is the gesture's
            only feedback, and it animates nothing — it tracks the pointer the
            way a cursor does. Suppressing it would leave the drag invisible. */
      }
      {origin && (
        <SidebarDragPreview
          guideRef={guideRef}
          fillRef={fillRef}
          edgeRef={edgeRef}
          origin={origin}
        />
      )}
    </>
  );
};

export default SidebarResizeHandle;
