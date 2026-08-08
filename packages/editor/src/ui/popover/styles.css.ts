/** Adapted from haklex `rich-editor-ui/src/components/popover` (MIT). */
import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { FONT, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

const popoverIn = keyframes({
  from: { opacity: 0, transform: "translateY(2px) scale(0.96)" },
  to: { opacity: 1, transform: "translateY(0) scale(1)" },
});

const popoverOut = keyframes({
  from: { opacity: 1, transform: "translateY(0) scale(1)" },
  to: { opacity: 0, transform: "translateY(2px) scale(0.96)" },
});

export const positioner = style({ outline: "none", zIndex: 1400 });

export const popup = style({
  width: 288,
  borderRadius: RADIUS.lg,
  border: `1px solid ${vars.color.border}`,
  padding: SPACE.lg,
  backgroundColor: vars.color.bgSecondary,
  color: vars.color.text,
  boxShadow: vars.shadow.modal,
  outline: "none",
  fontFamily: "inherit",
  transition: "opacity 150ms ease-out, transform 150ms ease-out",
  selectors: {
    "&[data-open]": { animation: `${popoverIn} 150ms ease-out` },
    "&[data-ending-style]": {
      opacity: 0,
      transform: "translateY(2px) scale(0.96)",
    },
    "&[data-closed]": { animation: `${popoverOut} 150ms ease-in` },
  },
});

export const arrow = style({
  width: 10,
  height: 10,
  transformOrigin: "center",
});

globalStyle(`${arrow} > polygon`, { fill: vars.color.bgSecondary });
globalStyle(`${arrow} > polyline`, {
  stroke: vars.color.border,
  fill: "none",
});

export const title = style({
  fontSize: FONT.lg,
  fontWeight: 600,
  lineHeight: 1,
  color: vars.color.text,
});

export const description = style({
  fontSize: FONT.md,
  lineHeight: 1.4,
  color: vars.color.textSecondary,
  marginTop: SPACE.xs,
});
