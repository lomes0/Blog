/**
 * Layout for the three toolbar menus, for the shapes the kit has no primitive
 * for. Local rather than in `ui/` for the reason `Dialogs/styles.css.ts`
 * records: a rule with one consumer is layout, not a component.
 *
 * The stem is `menus`, not `menu`: `ui/menu.css.ts` already owns that name for
 * the kit's shared popup shapes, and a second `menu.css` anywhere on a resolved
 * path is the trap `toolbarLayout.css.ts` documents.
 *
 * Colors come from `styles/tokens.css.ts` — `npm run check:theme` reads this
 * file and rejects a literal.
 */
import { style } from "@vanilla-extract/css";
import { FONT, SPACE } from "../../../styles/scale";
import { vars } from "../../../styles/tokens.css";

/**
 * MUI's `sm`, transcribed. The two selects used to collapse to icon-only below
 * it through `sx={{ display: { xs: "none", sm: "flex" } }}`; that is a media
 * query about viewport *width*, so it survives the move to vanilla-extract
 * unchanged. Nothing here keys off the color scheme.
 */
const UP_SM = "screen and (min-width: 600px)";

/** `FontSelect`'s two controls — the family select and the size stepper. */
export const row = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.xs,
});

/**
 * Both selects sit in a toolbar rather than a form, so the trigger loses the
 * kit's form-control width and shows only what it needs to.
 */
export const selectTrigger = style({
  flexShrink: 0,
  gap: SPACE.xs,
  paddingLeft: SPACE.sm,
  paddingRight: SPACE.xs,
});

/**
 * The icon and the word inside a trigger, on one line.
 *
 * `Select.Value` renders a plain inline wrapper, so without this the block-level
 * label below drops onto its own row and the trigger grows to two lines inside a
 * 52px toolbar. Laying the wrapper out as a flex row is what keeps the label
 * beside its icon; `minWidth: 0` is what lets the label's ellipsis engage
 * instead of the wrapper refusing to shrink.
 */
export const triggerValue = style({
  display: "inline-flex",
  alignItems: "center",
  gap: SPACE.xs,
  minWidth: 0,
  overflow: "hidden",
});

/**
 * The trigger's word — "Normal", "Roboto". Hidden on a narrow viewport, where
 * the icon alone identifies the control and the toolbar needs the width.
 */
export const triggerLabel = style({
  display: "none",
  maxWidth: "12ch",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  "@media": {
    // inline-block, not block: this sits inside `triggerValue`'s flex row, and
    // a block child there is what put the label under its icon.
    [UP_SM]: { display: "inline-block" },
  },
});

/** The icon column shared by a trigger and its items. */
export const optionIcon = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: 20,
  color: vars.color.textSecondary,
});

/**
 * `FontSelect`'s "Aa" swatch, drawn in the font it names. A specimen rather
 * than an icon, so it keeps the option's own family and weight.
 */
export const fontSample = style([optionIcon, {
  fontSize: FONT.lg,
  fontWeight: 500,
}]);

/** An option's label inside the popup. */
export const optionLabel = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

/**
 * Un-clamp the popup from the trigger's width.
 *
 * `ui/select`'s popup is `width: min(var(--anchor-width), …)`, which is right
 * for the dialogs it was ported for — a select that fills a form row and whose
 * list should line up under it. A toolbar trigger is 60–120px wide, so the same
 * rule would cut "Numbered List" in half and hide the size stepper entirely.
 *
 * `&&` rather than a plain class: the kit's rule and this one are both single
 * classes, so which wins would otherwise depend on the order two stylesheets
 * happen to land in the bundle. Doubling the selector settles it by
 * specificity, which no import order can change.
 */
export const popupSurface = style({
  selectors: {
    "&&": {
      width: "max-content",
      minWidth: 180,
      maxWidth: "calc(100vw - 0.75rem)",
    },
  },
});

/**
 * The font-size stepper, mounted at the head of the family popup.
 *
 * It is the only way to reach font size below `md`, where the toolbar's own
 * copy is hidden — so it stays in the popup rather than being dropped for the
 * convenience of the port. It is deliberately *not* a `Select.Item`: Base UI
 * registers items into a composite list and moves DOM focus between them, and
 * a number input that joins that list is one the keyboard cannot type into.
 */
export const popupHeader = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: `${SPACE.xs} ${SPACE.sm}`,
  marginBottom: SPACE.xs,
  borderBottom: `1px solid ${vars.color.border}`,
});

/**
 * A labelled menu trigger: the kit's `lg` outline button, toolbar weight.
 *
 * Shared by `InsertToolMenu` and by the three `Tools/` menus (Table, Note, AI),
 * which drew the same shape as four separate MUI `sx` blocks. `triggerLabel`
 * above is the other half of it — the word that disappears on a narrow
 * viewport, which each of those four also spelled out for itself.
 */
export const menuTrigger = style({
  fontWeight: 500,
  paddingLeft: "10px",
  paddingRight: SPACE.sm,
  gap: SPACE.xs,
});
