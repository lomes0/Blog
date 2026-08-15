/**
 * The row and column handles that appear beside a hovered table.
 *
 * Ported from haklex `rich-plugin-table/src/styles.css.ts` (MIT,
 * github.com/Innei/haklex). Two changes, both required here:
 *
 *  - **Every color is a token.** Theirs draws the resize affordance from
 *    literal `rgba(59,130,246,…)` gradients and tints its buttons with
 *    `color-mix` over a `vars.color.text` that is their palette, not ours.
 *    `npm run check:theme` reads this file and rejects a literal (DESIGN.md
 *    §19), so the ladder in `styles/tokens.css.ts` does that work instead —
 *    which is also what makes the handles follow the app's light/dark toggle.
 *  - **`position: fixed`, not `absolute` + `window.scrollY`.** A document in
 *    this app scrolls inside its pane, not the window, so page coordinates
 *    computed from `window.scrollY` are wrong the moment the pane is the
 *    scroller. Viewport coordinates are what `getBoundingClientRect` already
 *    returns; the plugin re-measures on scroll (captured, so inner scrollers
 *    are caught too).
 */
import { globalStyle, style } from "@vanilla-extract/css";
import { DURATION, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

/**
 * A handle is a floating strip of two controls: a quick-add and a menu grip.
 *
 * It is always mounted and always positioned — only opacity and hit-testing
 * change — so that showing it costs no layout and no portal churn on every
 * cell the pointer crosses.
 */
export const handle = style({
  "position": "fixed",
  "top": 0,
  "left": 0,
  "zIndex": 1000,
  "display": "flex",
  "alignItems": "center",
  "gap": "1px",
  "padding": "1px",
  "borderRadius": RADIUS.sm,
  "backgroundColor": vars.color.bgSecondary,
  "border": `1px solid ${vars.color.border}`,
  "boxShadow": vars.shadow.menu,
  "opacity": 0,
  "pointerEvents": "none",
  "transition": `opacity ${DURATION.base} ease`,
  "@media": {
    "print": { display: "none" },
  },
});

export const handleVisible = style({
  opacity: 1,
  pointerEvents: "auto",
});

/**
 * One 16px control. Small on purpose: the handle sits in the gutter beside the
 * table, and anything larger starts colliding with the text column at the
 * narrow end of the pane.
 */
export const button = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 16,
  height: 16,
  padding: 0,
  border: "none",
  borderRadius: RADIUS.sm,
  background: "transparent",
  color: vars.color.textTertiary,
  cursor: "pointer",
  transition: `background-color ${DURATION.fast} ease, color ${DURATION.fast} ease`,
  selectors: {
    "&:hover, &[data-popup-open]": {
      backgroundColor: vars.color.fillSecondary,
      color: vars.color.text,
    },
    "&:focus-visible": {
      outline: `2px solid ${vars.color.accent}`,
      outlineOffset: 1,
    },
  },
});

/**
 * The delete rows.
 *
 * The `svg` override is not decoration: `ui/menu.css`'s `applyItemSvgStyles`
 * pins every icon inside an item to `textSecondary` through a global rule, so
 * without this the label turns red and its glyph does not.
 */
export const destructiveItem = style({
  color: vars.color.danger,
  selectors: {
    "&[data-highlighted]": {
      color: vars.color.danger,
      backgroundColor: vars.color.dangerSoft,
    },
  },
});

globalStyle(`${destructiveItem} svg`, {
  color: vars.color.danger,
});

globalStyle(`${destructiveItem}[data-highlighted] svg`, {
  color: vars.color.danger,
});

/** Keeps the two menus from being narrower than their longest label. */
export const menu = style({
  minWidth: 200,
  padding: SPACE.xs,
});
