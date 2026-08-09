/**
 * The slash-command menu's surface.
 *
 * Only the *drawing* lives here. The menu's behaviour — the `/` trigger, the
 * filtering, arrow keys and Enter — belongs to Lexical's
 * `LexicalTypeaheadMenuPlugin`, which owns `selectedIndex` and hands it to the
 * renderer; nothing in this file or its component may take that over.
 *
 * Built on `ui/menu.css`'s shared popup and item rules so the slash menu, the
 * dropdown menus and the selects are one surface. That is also why the
 * highlighted row is marked with `data-highlighted` rather than a class of its
 * own: it is the attribute Base UI sets, so the shared rules — including the
 * icon's color change — already answer for it.
 */
import { globalStyle, style } from "@vanilla-extract/css";
import { applyItemSvgStyles, itemBase, popupBase } from "../../ui/menu.css";
import { SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

export const popup = style([popupBase, {
  width: 224,
  marginTop: SPACE.xl,
  maxHeight: 200,
  overflowY: "auto",
  overflowX: "hidden",
  "@media": {
    print: { display: "none" },
  },
}]);

export const item = style([itemBase, { cursor: "pointer" }]);

applyItemSvgStyles(item);

export const label = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

/** The trailing shortcut column — `##`, `/img`, `3x3`. */
export const shortcut = style({
  marginLeft: "auto",
  paddingLeft: SPACE.md,
  color: vars.color.textTertiary,
  fontVariantNumeric: "tabular-nums",
});

globalStyle(`${item}[data-highlighted] ${shortcut}`, {
  color: vars.color.textSecondary,
});
