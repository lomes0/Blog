/**
 * The sticky-note board's own chrome — the frame, the tool strip, the scroll
 * viewport and the bottom resize grip.
 *
 * **This file stops at the board's edge.** `CanvasComponent` renders five app
 * components inside it (`AddNoteButton`, `ZoomControls`, `SelectionBar`,
 * `SelectionMarquee`, `DraggableNote`) which live in `src/components/
 * NotesCanvas/` and stay on MUI — the app shell keeps DESIGN.md. So the strip
 * below is drawn from `--ed-*` while the two controls sitting in it are drawn
 * from the MUI palette; both alias the same underlying values, which is exactly
 * why `styles/tokens.css.ts` aliases rather than redefines. That seam is
 * deliberate and is what phase 3's `slot.ts` host-injection work is for.
 */
import { style } from "@vanilla-extract/css";
import { RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

/** The board frame. Its height is authored per node, so it stays inline. */
export const board = style({
  display: "flex",
  flexDirection: "column",
  margin: `${SPACE.lg} 0`,
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: RADIUS.lg,
  overflow: "hidden",
  position: "relative",
});

/** The tool strip: add-note, zoom, then the delete button pushed to the end. */
export const toolbar = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.sm,
  padding: `6px ${SPACE.md}`,
  borderBottom: `1px solid ${vars.color.border}`,
  flexShrink: 0,
});

export const toolbarSpacer = style({ flex: 1 });

/**
 * The scrolling viewport.
 *
 * The grid was a `theme.applyStyles("dark", …)` pair — a 3% black wash light,
 * a 2% white one dark. `fillQuaternary` is that pair as one token: it is built
 * from the text channel at 2.5%, so it is near-black on the light canvas and
 * near-white on the dark one and there is no second declaration to keep in
 * step. `backgroundSize` follows the zoom and stays inline.
 *
 * Focusable on purpose — the clipboard shortcuts have to land on the board the
 * author is in, and a document can hold several.
 */
export const viewport = style({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  position: "relative",
  outline: "none",
  backgroundImage: [
    `linear-gradient(${vars.color.fillQuaternary} 1px, transparent 1px)`,
    `linear-gradient(90deg, ${vars.color.fillQuaternary} 1px, transparent 1px)`,
  ].join(", "),
  selectors: {
    "&:focus-visible": {
      outline: `2px solid ${vars.color.accent}`,
      outlineOffset: "-2px",
    },
  },
});

/** Keeps the scrollbars honest about the scaled board; sized inline. */
export const sizer = style({
  minWidth: "100%",
  minHeight: "100%",
  position: "relative",
});

/** The unscaled board the notes are laid out on; transformed inline. */
export const surface = style({
  position: "absolute",
  top: 0,
  left: 0,
  transformOrigin: "top left",
});

/** The bottom grip that drags the board's height. */
export const resizeGrip = style({
  height: "10px",
  flexShrink: 0,
  cursor: "ns-resize",
  borderTop: `1px solid ${vars.color.border}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  selectors: {
    "&::after": {
      content: '""',
      width: "32px",
      height: "3px",
      borderRadius: "999px",
      backgroundColor: vars.color.border,
    },
    "&:hover::after": { backgroundColor: vars.color.textSecondary },
  },
});
