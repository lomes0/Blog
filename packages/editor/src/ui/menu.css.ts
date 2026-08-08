/**
 * Adapted from haklex `packages/rich-editor-ui/src/styles/menu.css.ts`
 * (MIT, github.com/Innei/haklex). Retinted to the `--ed-*` contract in
 * `styles/tokens.css.ts`; see docs/plans/haklex-adoption.md §5.
 *
 * The popup and item shapes shared by every floating surface in the kit —
 * dropdown menu, combobox, and anything later that grows a list. Kept as
 * `StyleRule` objects rather than classes so a consumer can spread and extend
 * them; only the two leaf styles that nobody extends are `style()` here.
 */
import type { StyleRule } from "@vanilla-extract/css";
import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { FONT, RADIUS, SPACE } from "../styles/scale";
import { vars } from "../styles/tokens.css";

const popupIn = keyframes({
  from: { opacity: 0, transform: "scale(0.95)" },
  to: { opacity: 1, transform: "scale(1)" },
});

const popupOut = keyframes({
  from: { opacity: 1, transform: "scale(1)" },
  to: { opacity: 0, transform: "scale(0.95)" },
});

export const popupBase: StyleRule = {
  minWidth: "8rem",
  borderRadius: RADIUS.lg,
  padding: SPACE.xs,
  backgroundColor: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  boxShadow: vars.shadow.menu,
  outline: "none",
  color: vars.color.text,
  fontFamily: "inherit",
  fontSize: FONT.md,
  zIndex: 50,
  maxHeight: "var(--available-height)",
  overflowX: "hidden",
  overflowY: "auto",
  transformOrigin: "var(--transform-origin)",
  transition: "opacity 100ms ease-out, transform 100ms ease-out",
  selectors: {
    "&[data-open]": { animation: `${popupIn} 100ms ease-out` },
    "&[data-starting-style]": { opacity: 0, transform: "scale(0.95)" },
    "&[data-ending-style]": { opacity: 0, transform: "scale(0.95)" },
    "&[data-closed]": {
      animation: `${popupOut} 100ms ease-in`,
      overflow: "hidden",
    },
  },
};

export const itemBase: StyleRule = {
  display: "flex",
  alignItems: "center",
  gap: SPACE.sm,
  borderRadius: RADIUS.md,
  padding: `${SPACE.xs} ${SPACE.md} ${SPACE.xs} ${SPACE.sm}`,
  fontSize: FONT.md,
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
};

/**
 * Icons inside an item are addressed by descendant selector rather than a prop,
 * because callers pass arbitrary `lucide-react` elements as children and should
 * not have to remember a class for each one.
 */
export function applyItemSvgStyles(itemClass: string) {
  globalStyle(`${itemClass} svg`, {
    pointerEvents: "none",
    flexShrink: 0,
    width: "1rem",
    height: "1rem",
    color: vars.color.textSecondary,
    transition: "color 100ms ease",
  });

  globalStyle(`${itemClass}[data-highlighted] svg`, {
    color: vars.color.text,
  });
}

export const separator = style({
  height: "1px",
  backgroundColor: vars.color.border,
  margin: `${SPACE.xs} calc(-1 * ${SPACE.xs})`,
});

export const label = style({
  fontSize: FONT.xs,
  fontWeight: 500,
  lineHeight: 1.4,
  color: vars.color.textTertiary,
  padding: `${SPACE.xs} ${SPACE.sm}`,
});
