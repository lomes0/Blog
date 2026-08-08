import { style } from "@vanilla-extract/css";
import { SPACE } from "../../../styles/scale";
import { vars } from "../../../styles/tokens.css";

/** The row itself — what MUI's `<Box sx={{ display: "flex" }}>` was. */
export const bar = style({
  display: "flex",
  alignItems: "center",
  gap: "2px",
});

/**
 * The connected-button look of `ToggleButtonGroup` is gone deliberately: the
 * kit's buttons are ghost by default and read as a row of affordances rather
 * than a segmented control. This keeps the toggles and the overflow button in
 * one visual group without drawing a box around them.
 */
export const group = style({
  display: "flex",
  alignItems: "center",
  gap: "2px",
});

/** Separates the color picker from the format toggles. */
export const divider = style({
  width: "1px",
  alignSelf: "stretch",
  margin: `2px ${SPACE.xs}`,
  backgroundColor: vars.color.border,
});
