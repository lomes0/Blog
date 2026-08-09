/**
 * Not a haklex port — their kit has no switch. Drawn against the `--ed-*`
 * contract at MUI's `size="small"` proportions, which is what the three
 * dialogs that use one were laid out around.
 */
import { style } from "@vanilla-extract/css";
import { DURATION, FONT, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

const TRACK_WIDTH = 34;
const TRACK_HEIGHT = 20;
const THUMB = 16;

export const track = style({
  position: "relative",
  flexShrink: 0,
  width: TRACK_WIDTH,
  height: TRACK_HEIGHT,
  padding: 0,
  margin: 0,
  border: `1px solid ${vars.color.border}`,
  borderRadius: TRACK_HEIGHT / 2,
  backgroundColor: vars.color.fillTertiary,
  cursor: "pointer",
  outline: "none",
  transition:
    `background-color ${DURATION.base} ease, border-color ${DURATION.base} ease`,
  selectors: {
    "&[data-checked]": {
      backgroundColor: vars.color.accent,
      borderColor: vars.color.accent,
    },
    "&:focus-visible": { boxShadow: `0 0 0 2px ${vars.color.accentSoft}` },
    "&[data-disabled]": { opacity: 0.45, cursor: "not-allowed" },
  },
});

export const thumb = style({
  display: "block",
  width: THUMB,
  height: THUMB,
  borderRadius: "50%",
  backgroundColor: vars.color.bgSecondary,
  boxShadow: vars.shadow.menu,
  transition: `transform ${DURATION.base} ease`,
  transform: "translateX(1px)",
  selectors: {
    "&[data-checked]": {
      transform: `translateX(${TRACK_WIDTH - THUMB - 3}px)`,
      backgroundColor: vars.color.accentContrast,
    },
  },
});

/** The `FormControlLabel` row: control on the left, label filling the rest. */
export const row = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.sm,
  minWidth: 0,
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
