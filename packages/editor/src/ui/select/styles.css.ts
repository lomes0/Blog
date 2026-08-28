/** Adapted from haklex `rich-editor-ui/src/components/select` (MIT). */
import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { FONT, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

const fadeInZoom = keyframes({
  from: { opacity: 0, transform: "scale(0.95)" },
  to: { opacity: 1, transform: "scale(1)" },
});

const fadeOutZoom = keyframes({
  from: { opacity: 1, transform: "scale(1)" },
  to: { opacity: 0, transform: "scale(0.95)" },
});

export const triggerButton = style({
  "display": "inline-flex",
  "alignItems": "center",
  "justifyContent": "space-between",
  "gap": "6px",
  "height": "36px",
  "padding": `${SPACE.sm} ${SPACE.sm} ${SPACE.sm} 10px`,
  "fontSize": FONT.lg,
  "lineHeight": 1.35,
  "fontFamily": "inherit",
  "border": `1px solid ${vars.color.border}`,
  "borderRadius": RADIUS.md,
  "background": "transparent",
  "color": vars.color.text,
  "cursor": "pointer",
  "outline": "none",
  "whiteSpace": "nowrap",
  "transition":
    "color 150ms ease, box-shadow 150ms ease, border-color 150ms ease",
  ":hover": { background: vars.color.fillQuaternary },
  ":focus-visible": {
    borderColor: vars.color.accent,
    boxShadow: vars.shadow.focusRing,
  },
  "selectors": {
    "&[data-popup-open]": { background: vars.color.fillQuaternary },
    "&[data-disabled]": { opacity: 0.5, cursor: "not-allowed" },
  },
});

export const triggerIcon = style({
  width: "16px",
  height: "16px",
  color: vars.color.textTertiary,
  flexShrink: 0,
  pointerEvents: "none",
});

export const positioner = style({
  outline: "none",
  zIndex: 1400,
  isolation: "isolate",
});

export const popup = style({
  background: vars.color.bgSecondary,
  color: vars.color.text,
  fontFamily: "inherit",
  fontSize: FONT.lg,
  borderRadius: RADIUS.md,
  border: `1px solid ${vars.color.border}`,
  boxShadow: vars.shadow.menu,
  width: "min(var(--anchor-width), calc(100vw - 0.75rem))",
  maxWidth: "calc(100vw - 0.75rem)",
  maxHeight: "var(--available-height)",
  overflowX: "hidden",
  overflowY: "auto",
  outline: "none",
  transformOrigin: "var(--transform-origin)",
  transition: "opacity 100ms ease-out, transform 100ms ease-out",
  selectors: {
    "&[data-open]": { animation: `${fadeInZoom} 100ms ease-out` },
    "&[data-starting-style]": { opacity: 0, transform: "scale(0.95)" },
    "&[data-ending-style]": { opacity: 0, transform: "scale(0.95)" },
    "&[data-closed]": {
      animation: `${fadeOutZoom} 100ms ease-in`,
      overflow: "hidden",
    },
  },
});

export const group = style({
  padding: SPACE.xs,
  selectors: {
    "& + &": { borderTop: `1px solid ${vars.color.border}` },
  },
});

export const item = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.sm,
  padding: "6px 32px 6px 8px",
  borderRadius: RADIUS.sm,
  fontSize: FONT.lg,
  lineHeight: 1.35,
  outline: "none",
  userSelect: "none",
  cursor: "default",
  color: vars.color.text,
  position: "relative",
  transition: "background-color 100ms ease, color 100ms ease",
  selectors: {
    "&[data-highlighted]": {
      backgroundColor: vars.color.fillSecondary,
      color: vars.color.text,
    },
    "&[data-disabled]": { opacity: 0.5, pointerEvents: "none" },
  },
});

globalStyle(`${item} svg`, {
  pointerEvents: "none",
  flexShrink: 0,
});

export const itemIndicator = style({
  position: "absolute",
  right: SPACE.sm,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "16px",
  height: "16px",
  pointerEvents: "none",
  color: vars.color.textSecondary,
});

globalStyle(`${item}[data-highlighted] ${itemIndicator}`, {
  color: vars.color.text,
});

export const groupLabel = style({
  padding: "6px 8px",
  fontSize: FONT.xs,
  fontWeight: 500,
  lineHeight: 1.4,
  color: vars.color.textTertiary,
});

export const separator = style({
  height: "1px",
  backgroundColor: vars.color.border,
  margin: `${SPACE.xs} calc(-1 * ${SPACE.xs})`,
});

export const scrollButton = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  padding: "4px 0",
  cursor: "default",
  color: vars.color.textTertiary,
  background: vars.color.bgSecondary,
  zIndex: 10,
});
