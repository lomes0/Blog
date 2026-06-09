/**
 * Canonical icon sizes for `lucide-react` `size` props.
 *
 * lucide icons bypass the MUI theme, so this map is the single source of truth
 * for icon dimensions — it mirrors the scale documented in DESIGN.md §16. Always
 * reach for a token, never a raw number.
 */
export const ICON_SIZE = {
  /** 14px — inline with dense text, button start/end icons */
  inline: 14,
  /** 18px — dense UI: toolbars, chips, table rows */
  dense: 18,
  /** 24px — default UI: buttons, menus, dialogs (lucide's own default) */
  default: 24,
  /** 32px — large decorative */
  large: 32,
  /** 64px — empty-state / hero glyphs */
  display: 64,
} as const;
