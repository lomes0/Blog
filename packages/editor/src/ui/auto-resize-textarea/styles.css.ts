/** Adapted from haklex `rich-editor-ui/src/components/auto-resize-textarea` (MIT). */
import { style } from "@vanilla-extract/css";
import { FONT, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

export const textarea = style({
  "width": "100%",
  "resize": "none",
  "overflow": "hidden",
  "border": `1px solid ${vars.color.border}`,
  "borderRadius": RADIUS.md,
  "padding": `${SPACE.sm} ${SPACE.md}`,
  "fontSize": FONT.lg,
  "lineHeight": 1.5,
  "outline": "none",
  "background": vars.color.bg,
  "color": vars.color.text,
  "fontFamily": "inherit",
  ":focus": { borderColor: vars.color.accent },
  "::placeholder": { color: vars.color.textTertiary },
});

export const overflowing = style({ overflowY: "auto" });
