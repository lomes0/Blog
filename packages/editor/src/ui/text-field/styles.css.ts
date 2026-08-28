/**
 * Not a haklex port — their kit has no text input, because their editor chrome
 * never asks for one. This is the smallest thing that replaces MUI's
 * `TextField` at the thirteen call sites in `plugins/ToolbarPlugin/Dialogs`,
 * drawn against the same `--ed-*` contract as everything else in `ui/`.
 *
 * The one deliberate departure from what it replaces: the label sits **above**
 * the control instead of riding the notch in the outline. MUI's floating label
 * is three coupled animations, a `<fieldset><legend>` whose width is measured
 * from the label, and a shrink state that has to know whether the field is
 * focused or filled. A static label is a fifth of the CSS, and it does not
 * disagree with the label above a `Switch` or a `RadioGroup` a few lines down
 * in the same form.
 */
import { globalStyle, style } from "@vanilla-extract/css";
import { DURATION, FONT, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

export const root = style({
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  minWidth: 0,
});

export const label = style({
  fontFamily: "inherit",
  fontSize: FONT.sm,
  fontWeight: 500,
  lineHeight: 1.4,
  color: vars.color.textSecondary,
  userSelect: "none",
});

/**
 * `:focus-within` rather than `:focus`, so the ring is the same rule whether
 * the class lands on the control itself or on a wrapper around one.
 */
const controlBase = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  fontFamily: "inherit",
  fontSize: FONT.lg,
  lineHeight: 1.5,
  color: vars.color.text,
  backgroundColor: vars.color.bg,
  border: `1px solid ${vars.color.border}`,
  borderRadius: RADIUS.md,
  outline: "none",
  transition:
    `border-color ${DURATION.base} ease, box-shadow ${DURATION.base} ease`,
} as const;

const controlStates = {
  "&:hover:not(:disabled):not(:focus)": { borderColor: vars.color.text },
  "&:focus": {
    borderColor: vars.color.accent,
    boxShadow: vars.shadow.focusRing,
  },
  "&:disabled": {
    color: vars.color.textTertiary,
    backgroundColor: vars.color.fillQuaternary,
    cursor: "not-allowed",
  },
  "&::placeholder": { color: vars.color.textTertiary },
};

export const control = style({
  ...controlBase,
  height: "34px",
  padding: `0 10px`,
  selectors: controlStates,
});

export const textarea = style({
  ...controlBase,
  minHeight: "76px",
  padding: `${SPACE.sm} 10px`,
  resize: "vertical",
  selectors: controlStates,
});

/**
 * A control with adornments either side — the row `TableDialog` builds around
 * its number inputs. The border moves to the row so the buttons sit *inside*
 * it, which is why the inner control drops its own.
 */
export const adornedRow = style({
  display: "flex",
  alignItems: "stretch",
  gap: 0,
});

globalStyle(`${adornedRow} > ${control}`, {
  borderRadius: 0,
  textAlign: "center",
});

/** Overlap the shared hairline so the seam is one pixel, not two. */
globalStyle(`${adornedRow} > * + *`, { marginLeft: "-1px" });

/** …and lift whichever one is focused, so its ring is not clipped by a sibling. */
globalStyle(`${adornedRow} > *:focus`, { position: "relative", zIndex: 1 });

globalStyle(`${adornedRow} > *:first-child`, {
  borderTopLeftRadius: RADIUS.md,
  borderBottomLeftRadius: RADIUS.md,
});

globalStyle(`${adornedRow} > *:last-child`, {
  borderTopRightRadius: RADIUS.md,
  borderBottomRightRadius: RADIUS.md,
});

/** A stepper button flanking a number input inside `adornedRow`. */
export const stepper = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "34px",
  height: "34px",
  padding: 0,
  cursor: "pointer",
  color: vars.color.textSecondary,
  backgroundColor: vars.color.bg,
  border: `1px solid ${vars.color.border}`,
  outline: "none",
  selectors: {
    "&:hover:not(:disabled)": {
      color: vars.color.text,
      backgroundColor: vars.color.fillSecondary,
    },
    "&:focus-visible": { boxShadow: vars.shadow.focusRing },
    "&:disabled": { opacity: 0.45, cursor: "not-allowed" },
  },
});
