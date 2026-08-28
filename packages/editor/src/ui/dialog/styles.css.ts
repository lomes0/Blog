/** Adapted from haklex `rich-editor-ui/src/components/dialog` (MIT). */
import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { FONT, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
const fadeOut = keyframes({ from: { opacity: 1 }, to: { opacity: 0 } });

const contentIn = keyframes({
  from: { opacity: 0, transform: "translate(-50%, -48%) scale(0.95)" },
  to: { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
});

const contentOut = keyframes({
  from: { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
  to: { opacity: 0, transform: "translate(-50%, -48%) scale(0.95)" },
});

export const backdrop = style({
  position: "fixed",
  inset: 0,
  zIndex: 1400,
  backgroundColor: vars.constant.scrim,
  selectors: {
    "&[data-open]": { animation: `${fadeIn} 250ms ease-out` },
    "&[data-closed]": { animation: `${fadeOut} 200ms ease-in` },
  },
});

/**
 * The one place the editor answers "when does a dialog go full-screen?".
 *
 * `(max-width: 899.95px)` is exactly what `theme.breakpoints.down("md")`
 * compiles to, and four of the ten `ToolbarPlugin` dialogs used to evaluate it
 * in JS with `useMediaQuery`. That is a hook, a subscription and a re-render
 * per dialog to decide a thing CSS already knows — and it answers `false` on
 * the server, so the first paint was always the desktop shape. The breakpoint
 * is preserved; only where it is evaluated has changed.
 */
const MOBILE = "(max-width: 899.95px)";

/**
 * Edge-to-edge: no corners, no border, no centering transform. Used both by
 * `fullScreen="always"` (Sketch, Graph — Excalidraw and the GeoGebra applet
 * size themselves to the viewport) and, inside `MOBILE`, by
 * `fullScreen="mobile"`.
 */
const fullBleed = {
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  transform: "none",
  width: "100%",
  maxWidth: "100%",
  height: "100%",
  maxHeight: "100%",
  borderRadius: 0,
  border: "none",
} as const;

/** Full-bleed has nothing to slide from, so it fades. */
const fullIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
const fullOut = keyframes({ from: { opacity: 1 }, to: { opacity: 0 } });

const centeredAnimation = {
  "&[data-open]": { animation: `${contentIn} 150ms ease-out` },
  "&[data-closed]": { animation: `${contentOut} 100ms ease-in` },
};

const fullBleedAnimation = {
  "&[data-open]": { animation: `${fullIn} 150ms ease-out` },
  "&[data-closed]": { animation: `${fullOut} 100ms ease-in` },
};

/**
 * `flex` rather than haklex's `grid`: the popup's children are optional
 * (`DialogHeader`, `DialogBody` and `DialogFooter` are each used or not), and a
 * grid template that names three rows is wrong for every subset. A column flex
 * with `flex: 1; min-height: 0` on the body gives the scroll region MUI's
 * `DialogContent` provided, for any combination.
 */
export const popup = recipe({
  base: {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: 1401,
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: "calc(100% - 2rem)",
    // MUI's `.MuiDialog-paper` cap, so a tall form scrolls its body instead of
    // running off the viewport.
    maxHeight: "calc(100% - 4rem)",
    gap: 0,
    borderRadius: RADIUS.lg,
    border: `1px solid ${vars.color.border}`,
    padding: 0,
    fontFamily: "inherit",
    lineHeight: 1.43,
    color: vars.color.text,
    backgroundColor: vars.color.bgSecondary,
    boxShadow: vars.shadow.modal,
    outline: "none",
  },
  variants: {
    /**
     * Widths, once the viewport is wide enough to have any. `sm` is haklex's
     * original 28rem and stays the default; `md` and `lg` are MUI's `sm`/`md`
     * paper widths, which is what the dialogs that asked for a wider paper were
     * measured against.
     */
    size: {
      xs: { "@media": { "(min-width: 640px)": { maxWidth: "20rem" } } },
      sm: { "@media": { "(min-width: 640px)": { maxWidth: "28rem" } } },
      md: { "@media": { "(min-width: 640px)": { maxWidth: "37.5rem" } } },
      lg: { "@media": { "(min-width: 640px)": { maxWidth: "56.25rem" } } },
    },
    fullScreen: {
      never: { selectors: centeredAnimation },
      mobile: {
        selectors: centeredAnimation,
        "@media": { [MOBILE]: { ...fullBleed, selectors: fullBleedAnimation } },
      },
      always: { ...fullBleed, selectors: fullBleedAnimation },
    },
  },
  defaultVariants: { size: "sm", fullScreen: "never" },
});

/**
 * The scrolling middle of a dialog — MUI's `DialogContent`.
 *
 * `minHeight: 0` is the load-bearing line: without it a flex item refuses to
 * shrink below its content, and `maxHeight` on the popup silently does nothing.
 */
export const body = style({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  padding: `0 ${SPACE.lg} ${SPACE.md}`,
});

/** A `body` whose child owns the whole area (an iframe, a canvas). */
export const bodyFlush = style({
  flex: 1,
  minHeight: 0,
  position: "relative",
  overflow: "hidden",
  padding: 0,
});

export const closeButton = style({
  "position": "absolute",
  "top": "1.25rem",
  "right": SPACE.lg,
  "display": "inline-flex",
  "alignItems": "center",
  "justifyContent": "center",
  "width": 24,
  "height": 24,
  "borderRadius": RADIUS.sm,
  "border": "none",
  "background": "none",
  "cursor": "pointer",
  "opacity": 0.7,
  "color": vars.color.textSecondary,
  "transition": "opacity 0.2s ease, color 0.2s ease",
  ":hover": { opacity: 1, color: vars.color.text },
  ":focus-visible": {
    outline: "none",
    boxShadow: vars.shadow.focusRing,
  },
  "selectors": {
    "&:disabled": { pointerEvents: "none", opacity: 0.5 },
  },
});

globalStyle(`${closeButton} svg`, {
  width: 16,
  height: 16,
  pointerEvents: "none",
  flexShrink: 0,
});

export const header = style({
  display: "flex",
  alignItems: "flex-start",
  gap: SPACE.md,
  padding: `1.25rem ${SPACE.lg} ${SPACE.md}`,
  flexShrink: 0,
});

export const headerContent = style({
  "display": "flex",
  "flexDirection": "column",
  "gap": SPACE.xs,
  "flex": 1,
  "minWidth": 0,
  "textAlign": "center",
  "@media": {
    "(min-width: 640px)": { textAlign: "left" },
  },
});

export const footer = style({
  "display": "flex",
  "flexDirection": "column-reverse",
  "gap": SPACE.sm,
  "padding": `${SPACE.md} ${SPACE.lg} 1.25rem`,
  "flexShrink": 0,
  "@media": {
    "(min-width: 640px)": {
      flexDirection: "row",
      justifyContent: "flex-end",
    },
  },
});

export const title = style({
  fontFamily: "inherit",
  fontSize: "1.0625rem",
  fontWeight: 600,
  lineHeight: 1.33,
  letterSpacing: "-0.015em",
  color: vars.color.text,
});

export const description = style({
  fontFamily: "inherit",
  fontSize: FONT.lg,
  lineHeight: 1.43,
  color: vars.color.textSecondary,
});

// ── Bottom sheet ─────────────────────────────────────────────────────────────

const slideUp = keyframes({
  from: { transform: "translateY(100%)" },
  to: { transform: "translateY(0)" },
});

const slideDown = keyframes({
  from: { transform: "translateY(0)" },
  to: { transform: "translateY(100%)" },
});

export const sheetBackdrop = style({
  position: "fixed",
  inset: 0,
  zIndex: 1400,
  backgroundColor: vars.constant.scrim,
  transition: "opacity 200ms ease",
});

export const sheetContainer = style({
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 1401,
  display: "flex",
  flexDirection: "column",
  maxHeight: "85vh",
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.text,
  fontFamily: "inherit",
  boxShadow: vars.shadow.modal,
  willChange: "transform",
  selectors: {
    "&[data-open]": {
      animation: `${slideUp} 300ms cubic-bezier(0.32, 0.72, 0, 1)`,
    },
    "&[data-closed]": { animation: `${slideDown} 200ms ease-in` },
  },
});

export const sheetDragHandle = style({
  "display": "flex",
  "alignItems": "center",
  "justifyContent": "center",
  "padding": "12px 0 4px",
  "cursor": "grab",
  "flexShrink": 0,
  "touchAction": "none",
  ":active": { cursor: "grabbing" },
});

export const sheetDragPill = style({
  width: 36,
  height: 4,
  borderRadius: 2,
  backgroundColor: vars.color.textTertiary,
  opacity: 0.5,
});

export const sheetContent = style({
  flex: 1,
  overflowY: "auto",
  overflowX: "hidden",
  padding: `0 ${SPACE.lg} ${SPACE.lg}`,
  WebkitOverflowScrolling: "touch",
});

export const sheetHeader = style({
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xs,
  textAlign: "center",
  padding: `0 ${SPACE.lg} ${SPACE.sm}`,
});
