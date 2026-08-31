"use client";
import React from "react";
import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { FOCUS_RING, MOTION } from "@/theme/tokens";

/** Resting thickness of a drag edge. */
export const GRIPPER_W = 4;

/**
 * Which of the two drag-edge appearances this gripper wears.
 *
 * - `wash` — the strip itself lights up: `primary` at half strength on hover,
 *   full while held. This is the edge of a *panel*, and it lies against a rail
 *   or a document on one side only, so painting the whole 4px strip is the only
 *   way to be seen at all.
 * - `rule` — the strip is a recessed channel ({@link RULE_CHANNEL}) with a 1px
 *   rule down its centre, and the rule alone answers hover, drag and focus: it
 *   recolours to `primary` and thickens ({@link RULE_W}). This is for an
 *   edge *between two documents*, where the strip
 *   is wide enough to grab comfortably and a band of `primary` landing between
 *   two columns of prose reads as a third thing on screen rather than as the
 *   seam between them.
 *
 *   The channel is the depth cue: the panes stand on the canvas and the seam
 *   sits one step below it, so the two strips either side of the rule are where
 *   each pane ends. They are structure and do not answer hover — only the middle
 *   line is the handle. (An earlier pass drew those two edges as hairlines
 *   instead. It read as three lines rather than as a gap between two surfaces,
 *   which is the thing the reference is actually showing.)
 *
 * Both live here rather than in the call sites for the reason in the component
 * note below: the rest/hover/active/focus ladder is one vocabulary (§17.3), and
 * a second appearance is a named member of it, not an override of it.
 */
type GripperVariant = "wash" | "rule";

/**
 * The `rule` variant's channel — the strip either side of its centre line.
 *
 * `background.sidebar` is the palette's "recessed below `default`" step, which
 * is what the sidebar and the two rails already stand on. Borrowing it here is
 * borrowing a *depth*, not a region: a seam between two documents is the same
 * one step below the canvas, and it tracks both colour schemes for free, which
 * a hand-mixed dark wash would not (§19).
 *
 * The delta this reproduces, measured off the reference: canvas `#1c202b`,
 * channel `#161923`. Ours is `#252b3a` → `#202634` in dark and `#ffffff` →
 * `#f8fafc` in light — the same few points of separation in both.
 */
const RULE_CHANNEL = "background.sidebar";

/**
 * The centre rule's thickness, at rest and while it is being addressed.
 *
 * It thickens on hover, drag and focus rather than only changing colour: the
 * strip around it is a grab area the pointer is already inside, and the rule
 * growing is what says the thing under the cursor is the handle and not the
 * seam. Both widths are odd so that a rule centred in `SPLITTER_W` — also odd —
 * lands on whole pixels in either state.
 *
 * 3px is the ceiling. Past it the accent stops reading as a lit rule and starts
 * reading as a band of colour between two columns of prose, which is the thing
 * the `rule` variant exists to avoid; the channel either side is only 5px, so
 * there is not much room to grow into either.
 */
const RULE_W = { rest: "1px", live: "3px" } as const;

/**
 * The `separator` half of the ARIA window-splitter pattern. Supply all four
 * together or none: a valued separator with no `aria-valuenow` announces as an
 * ordinary divider, and one that is operable by keyboard must be in the tab
 * order to say so.
 */
interface GripperValue {
  now: number;
  min: number;
  max: number;
  /** Read instead of the raw number — "Compact" beats "76". */
  text: string;
  /** Id of the pane this separator sizes. */
  controls: string;
}

interface ResizeGripperProps {
  /**
   * Start the drag — pass the owning panel's `startResize`. Omit it only when
   * the panel drives the gesture from the pointer handlers below instead.
   */
  onMouseDown?: (e: React.MouseEvent) => void;
  /**
   * Pointer-event route, for a panel that wants pointer capture — the whole
   * gesture is then delivered to this element even when the cursor leaves the
   * 4px strip, so the panel needs no `document` listeners of its own. The
   * sidebar uses it; the two mouse-driven panels do not, and passing neither
   * set is not a state worth typing away — a gripper with no handlers is a
   * divider, which is a legitimate thing to render.
   *
   * Do **not** `preventDefault` a `pointerdown` here: that suppresses the
   * compatibility mouse events, and `onDoubleClick` below is one of them. The
   * `user-select: none` on this element is what stops a drag from selecting
   * text, so preventing the default is not needed for it either.
   */
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerCancel?: (e: React.PointerEvent) => void;
  onLostPointerCapture?: (e: React.PointerEvent) => void;
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
  /**
   * How the edge paints itself — see {@link GripperVariant}. Defaults to `wash`,
   * which is what the three panel edges have always been.
   *
   * `rule` also stretches the element across its parent instead of sitting at
   * `left: 0` with a fixed width: the rule is centred in the grab strip, so the
   * strip's width belongs to the parent that reserves the space (the pane row's
   * `SPLITTER_W`) and not to a constant here.
   */
  variant?: GripperVariant;
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
 * The ladder has two appearances, `wash` and `rule` — see {@link
 * GripperVariant}. Same four rungs, same events, same ARIA; what differs is
 * whether the strip lights up or the hairline in it does. The pane splitter is
 * the only `rule` today, because it is the only edge with a document on *both*
 * sides.
 *
 * Focus is the fourth rung and is deliberately *louder* than §17.3's ring alone:
 * a 2px ring around a 4px transparent strip is not a visible focus indicator, so
 * a focused gripper also paints itself, the way a hovered one does. The ring
 * still carries the "this is focused, not merely hovered" distinction.
 */
const ResizeGripper: React.FC<ResizeGripperProps> = ({
  onMouseDown,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  isResizing,
  label,
  transition,
  value,
  onKeyDown,
  onDoubleClick,
  variant = "wash",
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
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerCancel}
    onLostPointerCapture={onLostPointerCapture}
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
        // A drag edge is never text and never a scroll surface. Both belong on
        // the shared component rather than on the one panel that noticed:
        // `user-select` is what lets the pointer route skip `preventDefault`,
        // and `touch-action` stops a touch drag being taken for a pan.
        userSelect: "none",
        touchAction: "none",
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
        // Everything above is the `wash`. The `rule` keeps the same states and
        // moves them onto the hairline: the strip becomes a recessed channel
        // that never changes, and the 1px rule down its centre is what carries
        // rest, hover, active and focus. Written as a trailing spread so each
        // key *replaces* the wash's — two `&:hover` entries in one literal
        // would silently drop the first.
        ...(variant === "rule" && {
          // The channel fills the grab strip edge to edge, so it meets both
          // panes with no sliver of canvas between. Its width is the parent's
          // to set (`SPLITTER_W`), which is also what sets how much channel
          // shows either side of the rule.
          left: 0,
          right: 0,
          width: "auto",
          backgroundColor: RULE_CHANNEL,
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: isResizing ? RULE_W.live : RULE_W.rest,
            backgroundColor: isResizing ? "primary.main" : "divider",
            transition: isResizing
              ? "none"
              : `background-color ${MOTION.base}ms ${MOTION.easing}, width ${MOTION.base}ms ${MOTION.easing}`,
          },
          // The channel holds still through every state — it is the gap between
          // two surfaces, not part of the handle.
          "&:hover, &:active": { backgroundColor: RULE_CHANNEL, opacity: 1 },
          "&:hover::before, &:active::before": {
            backgroundColor: "primary.main",
            width: RULE_W.live,
          },
          "&:focus-visible": {
            outline: "none",
            backgroundColor: RULE_CHANNEL,
            opacity: 1,
            // Not on the strip: a ring around the whole channel is a floating
            // rectangle. On the rule it reads as the hairline lighting up,
            // which is also what keeps focus distinguishable from hover — the
            // two are otherwise the same accent line.
            boxShadow: "none",
          },
          "&:focus-visible::before": {
            backgroundColor: "primary.main",
            width: RULE_W.live,
            boxShadow: FOCUS_RING.chrome,
          },
        }),
      },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  />
);

export default ResizeGripper;
