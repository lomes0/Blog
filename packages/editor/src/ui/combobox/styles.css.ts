/** Adapted from haklex `rich-editor-ui/src/components/combobox` (MIT). */
import { style } from "@vanilla-extract/css";
import { FONT, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";
import { applyItemSvgStyles, itemBase, popupBase } from "../menu.css";

export const positioner = style({ outline: "none", zIndex: 1400 });

export const popup = style({
  ...popupBase,
  maxHeight: "min(var(--available-height), 16rem)",
});

export const item = style(itemBase);

applyItemSvgStyles(item);

export const empty = style({
  fontSize: FONT.md,
  color: vars.color.textSecondary,
  textAlign: "center",
  padding: SPACE.sm,
});

export const input = style({
  "width": "100%",
  "border": `1px solid ${vars.color.border}`,
  "borderRadius": RADIUS.md,
  "padding": `6px ${SPACE.sm}`,
  "fontSize": FONT.lg,
  "fontFamily": "inherit",
  "background": vars.color.bg,
  "color": vars.color.text,
  "outline": "none",
  ":focus": { borderColor: vars.color.accent },
  "::placeholder": { color: vars.color.textTertiary },
});
