/**
 * The ten toolbar dialogs' own layout, for the shapes the kit has no primitive
 * for. Local rather than in `ui/` for the reason `nodes/AttachmentNode/
 * styles.css.ts` records: a rule with exactly one consumer is layout, not a
 * component, and promoting it costs a name everyone then has to know.
 *
 * Colors come from `styles/tokens.css.ts` — `npm run check:theme` reads this
 * file and rejects a literal.
 */
import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { FONT, RADIUS, SPACE } from "../../../styles/scale";
import { vars } from "../../../styles/tokens.css";

/** A dialog body's vertical rhythm: one gap, applied by the container. */
export const form = style({
  display: "flex",
  flexDirection: "column",
  gap: SPACE.md,
  minWidth: 0,
});

/** Two controls side by side, the first taking the slack. */
export const inlineRow = style({
  display: "flex",
  alignItems: "flex-end",
  gap: SPACE.sm,
  minWidth: 0,
});

export const grow = style({ flex: 1, minWidth: 0 });

/**
 * A footer button pushed to the leading edge, away from the confirm pair —
 * `LinkDialog`'s destructive "Unlink". Only meaningful once the footer is a
 * row, which is why it is a margin rather than an `order`.
 */
export const footerStart = style({ marginRight: "auto" });

/** An `ActionButton` that fills its container — MUI's `fullWidth`. */
export const blockButton = style({
  width: "100%",
  justifyContent: "center",
});

/** A dialog title with a leading icon. */
export const titleRow = style({
  display: "inline-flex",
  alignItems: "center",
  gap: SPACE.sm,
});

/** A heading inside the body — `ImageDialog`'s "From URL" / "From File". */
export const sectionHeading = style({
  fontFamily: "inherit",
  fontSize: FONT.lg,
  fontWeight: 600,
  lineHeight: 1.4,
  color: vars.color.text,
  margin: 0,
});

export const helpText = style({
  fontFamily: "inherit",
  fontSize: FONT.md,
  lineHeight: 1.5,
  color: vars.color.textSecondary,
});

export const metaText = style({
  fontFamily: "inherit",
  fontSize: FONT.md,
  lineHeight: 1.6,
  color: vars.color.text,
  margin: 0,
});

/** `AttachmentDialog`'s "OR" rule — a divider with a word in the middle. */
export const orDivider = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.md,
  fontFamily: "inherit",
  fontSize: FONT.md,
  color: vars.color.textSecondary,
  selectors: {
    "&::before": {
      content: '""',
      flex: 1,
      height: 1,
      backgroundColor: vars.color.border,
    },
    "&::after": {
      content: '""',
      flex: 1,
      height: 1,
      backgroundColor: vars.color.border,
    },
  },
});

/**
 * The full-bleed body of `GraphDialog` / `SketchDialog`, whose single child is
 * a third-party app sized to the viewport.
 */
export const appletHost = style({
  position: "absolute",
  inset: 0,
  overflow: "hidden",
});

export const appletLoading = style({
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1,
  backgroundColor: vars.color.bg,
});

const indeterminate = keyframes({
  "0%": { left: "-40%", width: "40%" },
  "60%": { left: "100%", width: "40%" },
  "100%": { left: "100%", width: "40%" },
});

/** `OCRDialog`'s progress line, replacing MUI's `LinearProgress`. */
export const progressTrack = style({
  position: "relative",
  height: 4,
  borderRadius: RADIUS.sm,
  overflow: "hidden",
  backgroundColor: vars.color.fillTertiary,
});

export const progressBar = style({
  position: "absolute",
  top: 0,
  bottom: 0,
  backgroundColor: vars.color.accent,
  animation: `${indeterminate} 1.6s ease-in-out infinite`,
});

/** The hidden `<input type="file">` a `FilePickerButton` drives. */
export const visuallyHiddenInput = style({
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
});

/** `AIDialog`'s model row: name, then whatever badges the model earns. */
export const modelRow = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.sm,
  minWidth: 0,
});

export const modelName = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

/**
 * `LinkDialog` renders each candidate figure's *exported DOM* as the option's
 * label, so the option has to tame arbitrary editor markup: shrink the media,
 * drop the caption, and stop a table from floating out of the list.
 */
export const figurePreview = style({
  display: "block",
  width: "100%",
  maxHeight: 56,
  overflow: "hidden",
});

globalStyle(`${figurePreview} :is(img, svg)`, { width: 40, height: "auto" });
globalStyle(`${figurePreview} figcaption`, { display: "none" });
globalStyle(`${figurePreview} table`, {
  tableLayout: "auto",
  margin: 0,
  float: "none",
});
