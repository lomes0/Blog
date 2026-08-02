"use client";
import React, { useLayoutEffect } from "react";
import { Box } from "@mui/material";
import { ACTIVITY_RAIL_W } from "./constants";

/**
 * Just under `ResizeGripper`'s 1300, so the strip you are holding still paints
 * over the preview it is drawing, and well over the Drawer's 1200.
 */
const PREVIEW_Z = 1299;

/** Thickness of the guide line and of the outline's edge. */
const LINE_W = 2;

/** Where the preview starts a gesture, in panel-width px. */
export interface PreviewOrigin {
  /** Raw pointer position — the guide line. */
  raw: number;
  /** Snapped destination — the outline. */
  width: number;
}

interface SidebarDragPreviewProps {
  /** Follows the raw pointer. Written by the drag loop, transform only. */
  guideRef: React.RefObject<HTMLDivElement | null>;
  /** The destination's translucent body. Scaled, not resized. */
  fillRef: React.RefObject<HTMLDivElement | null>;
  /** The destination's right edge. Translated, not repositioned. */
  edgeRef: React.RefObject<HTMLDivElement | null>;
  /** First frame's values, so the preview appears already in the right place. */
  origin: PreviewOrigin;
}

/**
 * What a sidebar resize drag shows instead of resizing the sidebar.
 *
 * The panel is frozen for the duration of the gesture; these three strips are
 * the whole of the feedback, and between them they teach the zone model:
 *
 * - the **guide line** tracks the raw pointer, unsnapped, so the user can see
 *   their own input even where it buys them nothing;
 * - the **outline** — a translucent body and a solid right edge — shows where a
 *   release would actually put the panel, so it parks at the compact width and
 *   stops following in the snap range, and holds still in the dead band.
 *
 * The gap that opens between the two *is* the explanation of a zone. Neither
 * reads as a panel: the body is a wash, not a surface.
 *
 * ── The rendering constraint ──────────────────────────────────────────────
 * All three are `position: fixed` siblings of the layout grid, so they are out
 * of every flow the content is in, and the drag loop only ever writes
 * `transform` to them. The outline's body is 1px wide and `scaleX`d to the
 * destination width rather than given one — a `width` write would be layout,
 * and layout is the cost the deferred commit exists to remove. That is also why
 * the body has no border: a scaled border scales unevenly, and the edge that
 * would need is a translated strip of its own.
 *
 * Mounted only while dragging, and never re-rendered: everything after the
 * first paint is an imperative transform write, which is what keeps a fast drag
 * across the full range free of React entirely.
 */
export const SidebarDragPreview: React.FC<SidebarDragPreviewProps> = ({
  guideRef,
  fillRef,
  edgeRef,
  origin,
}) => {
  // Before the browser paints the mount, so the preview never flashes at zero.
  // Read from props once; every later update comes from the drag loop.
  useLayoutEffect(() => {
    if (guideRef.current) {
      guideRef.current.style.transform = `translateX(${origin.raw}px)`;
    }
    if (fillRef.current) {
      fillRef.current.style.transform = `scaleX(${origin.width})`;
    }
    if (edgeRef.current) {
      edgeRef.current.style.transform = `translateX(${origin.width}px)`;
    }
    // Mount only — re-running this would fight the drag loop for the transform.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Shared by all three: out of flow, inert, and composited. */
  const strip = {
    position: "fixed",
    top: 0,
    bottom: 0,
    pointerEvents: "none",
    zIndex: PREVIEW_Z,
    willChange: "transform",
    displayPrint: "none",
  } as const;

  return (
    <>
      {
        /* The destination's body. 1px wide and scaled from its left edge, so
            the drag writes a scale factor rather than a width. */
      }
      <Box
        ref={fillRef}
        aria-hidden
        sx={{
          ...strip,
          left: ACTIVITY_RAIL_W,
          width: "1px",
          transformOrigin: "left",
          // Channel variable, not `alpha()`: under `cssVariables` the latter
          // bakes the light value into both schemes (DESIGN.md §2).
          backgroundColor: "rgba(var(--mui-palette-primary-mainChannel) / 0.10)",
        }}
      />
      {
        /* The destination's right edge — where the panel will actually end.
            Sits just inside the body so the two read as one shape. */
      }
      <Box
        ref={edgeRef}
        aria-hidden
        sx={{
          ...strip,
          left: ACTIVITY_RAIL_W - LINE_W,
          width: LINE_W,
          backgroundColor: "primary.main",
        }}
      />
      {
        /* The pointer itself. Dashed against the edge's solid, because the two
            coincide only in the free range and the difference is the point. */
      }
      <Box
        ref={guideRef}
        aria-hidden
        sx={{
          ...strip,
          left: ACTIVITY_RAIL_W - LINE_W / 2,
          width: LINE_W,
          backgroundImage: `repeating-linear-gradient(
            to bottom,
            rgba(var(--mui-palette-primary-mainChannel) / 0.7) 0 6px,
            transparent 6px 12px
          )`,
        }}
      />
    </>
  );
};
