/**
 * The floating text-format toolbar's surface.
 *
 * Replaces the MUI `<Paper sx={…}>` this component used to render. Two of the
 * `sx` entries were shorthands with real behaviour behind them, and both are
 * spelled out here rather than dropped:
 *
 *  - `display: ["none", "flex"]` is MUI's responsive array — hidden below the
 *    `sm` breakpoint, flex from it up. The toolbar is a mouse-selection
 *    affordance and gets in the way of a touch selection handle, so it stays
 *    hidden on phones. `600px` is MUI's `sm`; if `ThemeProvider` ever moves
 *    that breakpoint, this has to move with it.
 *  - `displayPrint: "none"` is `@media print`.
 *
 * `top`/`left`/`position` stay in the class: `setFloatingElemPosition` writes
 * `transform` and `opacity` only, and reads neither.
 */
import { style } from "@vanilla-extract/css";
import { RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

export const floatingToolbar = style({
  "display": "none",
  "position": "absolute",
  "top": 0,
  "left": 0,
  "zIndex": 1000,
  "willChange": "transform",
  "alignItems": "center",
  "padding": SPACE.xs,
  "borderRadius": RADIUS.lg,
  "backgroundColor": vars.color.bgSecondary,
  "border": `1px solid ${vars.color.border}`,
  "boxShadow": vars.shadow.menu,
  "color": vars.color.text,
  "@media": {
    "screen and (min-width: 600px)": { display: "flex" },
    "print": { display: "none" },
  },
});
