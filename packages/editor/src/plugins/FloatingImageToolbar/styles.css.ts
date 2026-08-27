/**
 * The floating figure panel's surface and its rows.
 *
 * Everything below `panel` moved here verbatim from
 * `ToolbarPlugin/Tools/tools.css.ts`, where it dressed the popover behind the
 * image toolbar's `Scaling` trigger. The controls moved
 * (docs/plans/archive/haklex-reprise.md §7.2); the rules move with them, so
 * `tools.css.ts` keeps meaning "layout for the seven `Tools/` components" and
 * a reader looking for the width slider finds it beside the width slider.
 *
 * Colors come from `styles/tokens.css.ts`; `npm run check:theme` reads this
 * file and rejects a literal.
 */
import { globalStyle, style } from "@vanilla-extract/css";
import { FONT, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

/**
 * The floating surface itself.
 *
 * Deliberately the same chrome as `FloatingToolbar/styles.css.ts` — same
 * radius, border, shadow and `zIndex`, and the same `position`/`top`/`left`,
 * because `setFloatingElemPosition` writes only `transform` and `opacity` and
 * reads neither.
 *
 * Two differences from that file, both intentional:
 *
 *  - **No `display: none` below 600px.** The text toolbar hides on phones
 *    because it fights a touch selection handle. A figure's selection has no
 *    handle to fight, and this panel is the *only* place the width and
 *    position controls now live — hiding it would mean a reader on a phone
 *    could select an image and do nothing to it.
 *  - `opacity: 0` to start. The element is measured before it is placed, so
 *    the first frame would otherwise be drawn at the top-left of the anchor
 *    before jumping into position.
 */
export const panel = style({
  "position": "absolute",
  "top": 0,
  "left": 0,
  "zIndex": 1000,
  "opacity": 0,
  "willChange": "transform",
  "display": "flex",
  "flexDirection": "column",
  "gap": SPACE.sm,
  "padding": SPACE.sm,
  "maxWidth": "min(360px, calc(100vw - 24px))",
  "borderRadius": RADIUS.lg,
  "backgroundColor": vars.color.bgSecondary,
  "border": `1px solid ${vars.color.border}`,
  "boxShadow": vars.shadow.menu,
  "color": vars.color.text,
  "@media": {
    "print": { display: "none" },
  },
});

/** One labelled band of controls: wrap, position, width. */
export const section = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.xs,
});

export const label = style({
  fontSize: FONT.xs,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: vars.color.textTertiary,
  minWidth: 54,
  flexShrink: 0,
});

/**
 * The one sentence that keeps align and float distinguishable. Having both
 * controls is confusing precisely until someone says what the difference is,
 * so the panel says it rather than leaving it to the icons.
 */
export const hint = style({
  fontSize: FONT.xs,
  lineHeight: 1.4,
  color: vars.color.textSecondary,
  margin: 0,
});

export const row = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.xs,
  flex: 1,
  minWidth: 0,
});

/** One of three toggles, sharing the row's width equally. */
export const option = style({
  flex: 1,
  minWidth: 0,
});

/** `Auto`, and the four percent presets. */
export const widthPreset = style([option, {
  padding: `0 ${SPACE.xs}`,
  fontSize: FONT.sm,
  fontVariantNumeric: "tabular-nums",
}]);

/* A toggle draws its glyph at the button's own size and never shrinks it. */
globalStyle(`${option} svg`, { flexShrink: 0 });

/** The slider, its ticks and its readout share one row. */
export const sizeSliderWrap = style({
  position: "relative",
  display: "flex",
  alignItems: "center",
  flex: 1,
  minWidth: 0,
});

/**
 * A range input, drawn against the token contract.
 *
 * The fill is a gradient stop driven by a `--fill` custom property the
 * component sets, because `::-webkit-slider-runnable-track` has no progress
 * pseudo-element the way Firefox's `::-moz-range-progress` does.
 */
export const sizeSlider = style({
  appearance: "none",
  WebkitAppearance: "none",
  width: "100%",
  height: 12,
  margin: 0,
  background: "transparent",
  cursor: "pointer",
  selectors: {
    "&::-webkit-slider-runnable-track": {
      height: 4,
      borderRadius: RADIUS.sm,
      background:
        `linear-gradient(to right, ${vars.color.accent} var(--fill), ${vars.color.fill} var(--fill))`,
    },
    "&::-webkit-slider-thumb": {
      WebkitAppearance: "none",
      appearance: "none",
      width: 12,
      height: 12,
      marginTop: -4,
      borderRadius: "50%",
      backgroundColor: vars.color.accent,
      border: `2px solid ${vars.color.bgSecondary}`,
    },
    "&::-moz-range-track": {
      height: 4,
      borderRadius: RADIUS.sm,
      backgroundColor: vars.color.fill,
    },
    "&::-moz-range-progress": {
      height: 4,
      borderRadius: RADIUS.sm,
      backgroundColor: vars.color.accent,
    },
    "&::-moz-range-thumb": {
      width: 12,
      height: 12,
      borderRadius: "50%",
      backgroundColor: vars.color.accent,
      border: `2px solid ${vars.color.bgSecondary}`,
    },
    "&:focus-visible": {
      outline: `2px solid ${vars.color.accent}`,
      outlineOffset: 2,
    },
  },
});

/** A preset's mark on the track. Positioned by `imageLayout.tickOffset`. */
export const sizeSliderTick = style({
  position: "absolute",
  top: "50%",
  width: 2,
  height: 2,
  marginTop: 3,
  borderRadius: "50%",
  backgroundColor: vars.color.textQuaternary,
  pointerEvents: "none",
  transform: "translate(-50%, -50%)",
});

export const sizeValue = style({
  minWidth: 38,
  textAlign: "right",
  fontSize: FONT.sm,
  fontVariantNumeric: "tabular-nums",
  color: vars.color.textSecondary,
});
