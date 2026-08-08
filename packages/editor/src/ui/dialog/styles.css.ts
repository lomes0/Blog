/** Adapted from haklex `rich-editor-ui/src/components/dialog` (MIT). */
import { globalStyle, keyframes, style } from "@vanilla-extract/css";
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

export const popup = style({
  "position": "fixed",
  "top": "50%",
  "left": "50%",
  "transform": "translate(-50%, -50%)",
  "zIndex": 1401,
  "display": "grid",
  "width": "100%",
  "maxWidth": "calc(100% - 2rem)",
  "gap": 0,
  "borderRadius": RADIUS.lg,
  "border": `1px solid ${vars.color.border}`,
  "padding": 0,
  "fontFamily": "inherit",
  "lineHeight": 1.43,
  "color": vars.color.text,
  "backgroundColor": vars.color.bgSecondary,
  "boxShadow": vars.shadow.modal,
  "outline": "none",
  "selectors": {
    "&[data-open]": { animation: `${contentIn} 150ms ease-out` },
    "&[data-closed]": { animation: `${contentOut} 100ms ease-in` },
  },
  "@media": {
    "(min-width: 640px)": { maxWidth: "28rem" },
  },
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
    boxShadow: `0 0 0 2px ${vars.color.accentSoft}`,
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
