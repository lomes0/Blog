/** Adapted from haklex `rich-editor-ui/src/components/dropdown-menu` (MIT). */
import { style } from "@vanilla-extract/css";
import { SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";
import {
  applyItemSvgStyles,
  itemBase,
  label as sharedLabel,
  popupBase,
  separator as sharedSeparator,
} from "../menu.css";

export const popup = style({
  ...popupBase,
  maxWidth: "min(20rem, calc(100vw - 0.75rem))",
});

export const positioner = style({
  outline: "none",
  // Above MUI's modal layer (1300), because a menu opened from the floating
  // toolbar has to clear both it and any dialog the toolbar sits inside.
  zIndex: 1400,
  isolation: "isolate",
  selectors: {
    '&[data-side="bottom"]': { transform: "translateY(2px)" },
    '&[data-side="top"]': { transform: "translateY(-2px)" },
    '&[data-side="left"]': { transform: "translateX(-2px)" },
    '&[data-side="right"]': { transform: "translateX(2px)" },
  },
});

export const item = style(itemBase);

applyItemSvgStyles(item);

export const separator = sharedSeparator;
export const label = sharedLabel;

const itemWithIndicator = style({ paddingRight: "2rem" });

export const checkboxItem = itemWithIndicator;
export const radioItem = itemWithIndicator;

const indicator = style({
  position: "absolute",
  right: SPACE.sm,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1rem",
  height: "1rem",
  flexShrink: 0,
  pointerEvents: "none",
  color: vars.color.textSecondary,
});

export const checkboxIndicator = indicator;
export const radioIndicator = indicator;

/** Trailing text on a menu row — the keyboard shortcut column. */
export const shortcut = style({
  marginLeft: "auto",
  paddingLeft: SPACE.lg,
  color: vars.color.textTertiary,
  fontVariantNumeric: "tabular-nums",
});
