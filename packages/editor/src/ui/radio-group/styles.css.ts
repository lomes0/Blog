/**
 * Not a haklex port — their kit has no radio. Drawn against the `--ed-*`
 * contract for the two dialogs that pick one option out of a short, visible
 * list (`LayoutDialog`'s column templates, `LinkDialog`'s external/internal).
 */
import { style } from "@vanilla-extract/css";
import { DURATION, FONT, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

export const group = style({
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xs,
});

export const groupRow = style({
  display: "flex",
  flexDirection: "row",
  flexWrap: "wrap",
  gap: SPACE.lg,
  alignItems: "center",
});

export const control = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: 18,
  height: 18,
  padding: 0,
  margin: 0,
  borderRadius: "50%",
  border: `1px solid ${vars.color.textTertiary}`,
  backgroundColor: vars.color.bg,
  cursor: "pointer",
  outline: "none",
  transition:
    `border-color ${DURATION.base} ease, background-color ${DURATION.base} ease`,
  selectors: {
    "&[data-checked]": { borderColor: vars.color.accent },
    "&:hover:not([data-disabled])": { borderColor: vars.color.accent },
    "&:focus-visible": { boxShadow: `0 0 0 2px ${vars.color.accentSoft}` },
    "&[data-disabled]": { opacity: 0.45, cursor: "not-allowed" },
  },
});

export const indicator = style({
  width: 10,
  height: 10,
  borderRadius: "50%",
  backgroundColor: vars.color.accent,
});

/** The `FormControlLabel` row: control on the left, label filling the rest. */
export const row = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.sm,
  minWidth: 0,
  padding: `2px 0`,
  cursor: "pointer",
  userSelect: "none",
  borderRadius: RADIUS.sm,
  selectors: {
    "&:has([data-disabled])": { cursor: "not-allowed", opacity: 0.6 },
  },
});

export const rowLabel = style({
  fontFamily: "inherit",
  fontSize: FONT.lg,
  lineHeight: 1.5,
  color: vars.color.text,
  cursor: "inherit",
});

/** The `FormLabel` above a group. */
export const groupLabel = style({
  display: "block",
  fontFamily: "inherit",
  fontSize: FONT.sm,
  fontWeight: 500,
  lineHeight: 1.4,
  marginBottom: SPACE.xs,
  color: vars.color.textSecondary,
});
