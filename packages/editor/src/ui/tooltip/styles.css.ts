/** Adapted from haklex `rich-editor-ui/src/components/tooltip` (MIT). */
import { keyframes, style } from "@vanilla-extract/css";
import { FONT, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

const tooltipIn = keyframes({
  from: { opacity: 0, transform: "translateY(2px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

const tooltipOut = keyframes({
  from: { opacity: 1, transform: "translateY(0)" },
  to: { opacity: 0, transform: "translateY(2px)" },
});

export const positioner = style({ zIndex: 1400, outline: "none" });

export const popup = style({
  maxWidth: 320,
  padding: `${SPACE.xs} ${SPACE.sm}`,
  fontSize: FONT.sm,
  fontFamily: "inherit",
  lineHeight: 1.4,
  color: vars.color.text,
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: RADIUS.md,
  boxShadow: vars.shadow.menu,
  outline: "none",
  whiteSpace: "normal",
  wordBreak: "break-word",
  pointerEvents: "none",
  transition: "opacity 120ms ease-out, transform 120ms ease-out",
  selectors: {
    "&[data-open]": { animation: `${tooltipIn} 120ms ease-out` },
    "&[data-ending-style]": { opacity: 0, transform: "translateY(2px)" },
    "&[data-closed]": { animation: `${tooltipOut} 120ms ease-in` },
  },
});
