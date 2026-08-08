/**
 * The editor kit's non-color scale: radii, spacing and type sizes.
 *
 * Deliberately a plain `.ts` module of constants rather than a second
 * `createGlobalThemeContract` group, for two reasons:
 *
 *  1. None of these values differ between light and dark, so nothing here
 *     needs to be a CSS variable that a scheme block can reassign. Shipping
 *     them as variables would imply they could flip, and invite someone to
 *     make them.
 *  2. `scripts/check-theme.mjs` exists to catch *colors* that stopped
 *     responding to the toggle. Keeping the scale out of the token contract
 *     keeps that file about exactly the thing it guards.
 *
 * The values are haklex's `rich-style-token` `sharedSpacing` /
 * `sharedBorderRadius` scale, which is what its component code is drawn
 * against — port the numbers or the ported components stop looking like one
 * system. Type sizes are ours, in px: haklex's are `em`-relative because their
 * kit is embedded in article typography at three different base sizes, and we
 * have one.
 *
 * Font *family* is deliberately absent. haklex pins a CJK-first stack; our
 * editor chrome sits inside the app's MUI typography and should inherit it, so
 * every rule in `ui/` says `fontFamily: "inherit"` or says nothing.
 */

/** Corner radii. `lg` is popups and dialogs, `md` controls, `sm` list items. */
export const RADIUS = {
  sm: "4px",
  md: "6px",
  lg: "10px",
} as const;

/** The 4px grid haklex's component padding is written against. */
export const SPACE = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
} as const;

/** Chrome type scale. `md` is the default for menus, items and buttons. */
export const FONT = {
  xs: "11px",
  sm: "12px",
  md: "13px",
  lg: "14px",
} as const;

/** One transition duration for the whole kit, so hovers agree with each other. */
export const DURATION = {
  fast: "100ms",
  base: "150ms",
} as const;
