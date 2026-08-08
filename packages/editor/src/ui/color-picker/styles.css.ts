/**
 * Adapted from haklex `rich-editor-ui/src/components/color-picker` (MIT).
 *
 * This is the one file in the kit with a real appetite for raw color literals,
 * and none of them are theme colors: a hue strip is the sRGB hue circle, the
 * alpha strip's checkerboard is what "transparent" looks like, and a picker
 * thumb is ringed in white because it sits on an arbitrary user-chosen color
 * rather than on the canvas. All of them come from `vars.constant.*` — see the
 * `constant` group in `styles/tokens.css.ts` for why that group exists instead
 * of an exemption in `scripts/check-theme.mjs`.
 */
import { keyframes, style } from "@vanilla-extract/css";
import { FONT, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

const fadeIn = keyframes({
  from: { opacity: 0, transform: "scale(0.95)" },
  to: { opacity: 1, transform: "scale(1)" },
});

export const trigger = style({
  "display": "flex",
  "alignItems": "center",
  "gap": 2,
  "height": 32,
  "padding": "0 6px",
  "border": "none",
  "background": "none",
  "borderRadius": RADIUS.md,
  "cursor": "pointer",
  "color": vars.color.textSecondary,
  "transition": "color 0.1s, background-color 0.1s",
  ":hover": {
    color: vars.color.text,
    backgroundColor: vars.color.fillTertiary,
  },
});

export const triggerLabel = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
});

export const triggerLetter = style({
  fontSize: FONT.xs,
  fontWeight: 600,
  lineHeight: 1,
});

export const triggerBar = style({
  marginTop: 2,
  height: 2,
  width: 14,
  borderRadius: 1,
});

export const triggerChevron = style({
  width: 12,
  height: 12,
  transition: "transform 0.15s",
});

export const panel = style({
  padding: SPACE.sm,
  width: 220,
  selectors: {
    "&[data-open]": { animation: `${fadeIn} 120ms ease-out` },
  },
});

export const grid = style({
  display: "grid",
  gridTemplateColumns: "repeat(6, 1fr)",
  gap: SPACE.xs,
});

export const swatch = style({
  "position": "relative",
  "display": "flex",
  "alignItems": "center",
  "justifyContent": "center",
  "width": 28,
  "height": 28,
  "border": "none",
  "background": "none",
  "borderRadius": RADIUS.md,
  "cursor": "pointer",
  "padding": 0,
  "transition": "background-color 0.1s",
  ":hover": { backgroundColor: vars.color.fillTertiary },
});

export const swatchDot = style({
  width: 16,
  height: 16,
  borderRadius: "50%",
  border: `1px solid ${vars.color.border}`,
});

export const swatchCheck = style({
  position: "absolute",
  width: 10,
  height: 10,
  color: vars.color.bg,
});

export const addSwatchDot = style({
  width: 16,
  height: 16,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: vars.constant.thumbRing,
  background: vars.constant.hueWheel,
});

export const addSwatchIcon = style({
  width: 10,
  height: 10,
  strokeWidth: 3,
});

export const pickerView = style({
  display: "flex",
  flexDirection: "column",
  gap: SPACE.sm,
});

export const backButton = style({
  "display": "flex",
  "alignItems": "center",
  "gap": SPACE.xs,
  "alignSelf": "flex-start",
  "padding": "2px 6px",
  "marginBottom": 2,
  "border": "none",
  "background": "none",
  "borderRadius": RADIUS.md,
  "cursor": "pointer",
  "fontFamily": "inherit",
  "fontSize": FONT.xs,
  "color": vars.color.textTertiary,
  "transition": "color 0.1s, background-color 0.1s",
  ":hover": {
    color: vars.color.text,
    backgroundColor: vars.color.fillTertiary,
  },
});

export const backIcon = style({ width: 12, height: 12 });

export const satSquare = style({
  position: "relative",
  width: "100%",
  height: 140,
  borderRadius: RADIUS.md,
  cursor: "crosshair",
  touchAction: "none",
  userSelect: "none",
  overflow: "hidden",
});

export const satOverlayX = style({
  position: "absolute",
  inset: 0,
  background:
    `linear-gradient(to right, ${vars.constant.satWhite}, transparent)`,
  pointerEvents: "none",
});

export const satOverlayY = style({
  position: "absolute",
  inset: 0,
  background: `linear-gradient(to top, ${vars.constant.satBlack}, transparent)`,
  pointerEvents: "none",
});

export const satThumb = style({
  position: "absolute",
  width: 12,
  height: 12,
  borderRadius: "50%",
  border: `2px solid ${vars.constant.thumbRing}`,
  boxShadow: `0 0 0 1px ${vars.constant.thumbShadow}`,
  transform: "translate(-50%, -50%)",
  pointerEvents: "none",
});

export const hueTrack = style({
  position: "relative",
  width: "100%",
  height: 10,
  borderRadius: 5,
  background: vars.constant.hueTrack,
  cursor: "pointer",
  touchAction: "none",
  userSelect: "none",
});

export const alphaTrack = style({
  position: "relative",
  width: "100%",
  height: 10,
  borderRadius: 5,
  background: vars.constant.checkerboard,
  cursor: "pointer",
  touchAction: "none",
  userSelect: "none",
  overflow: "hidden",
});

export const alphaGradient = style({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
});

export const sliderThumb = style({
  position: "absolute",
  top: "50%",
  width: 14,
  height: 14,
  borderRadius: "50%",
  border: `2px solid ${vars.constant.thumbRing}`,
  boxShadow: `0 0 0 1px ${vars.constant.thumbShadow}`,
  transform: "translate(-50%, -50%)",
  pointerEvents: "none",
});

export const hexRow = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.xs,
});

export const hexInput = style({
  "flex": 1,
  "minWidth": 0,
  "fontFamily":
    'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", "Courier New", monospace',
  "fontSize": FONT.xs,
  "padding": "4px 6px",
  "border": `1px solid ${vars.color.border}`,
  "borderRadius": RADIUS.md,
  "background": vars.color.bg,
  "color": vars.color.text,
  "outline": "none",
  "textTransform": "uppercase",
  ":focus": { borderColor: vars.color.accent },
});

export const hexInputInvalid = style({
  "borderColor": vars.color.danger,
  ":focus": { borderColor: vars.color.danger },
});

export const iconButton = style({
  "display": "flex",
  "alignItems": "center",
  "justifyContent": "center",
  "width": 24,
  "height": 24,
  "border": `1px solid ${vars.color.border}`,
  "borderRadius": RADIUS.md,
  "background": vars.color.bg,
  "color": vars.color.textSecondary,
  "cursor": "pointer",
  "padding": 0,
  "transition": "background-color 0.1s, color 0.1s",
  ":hover": {
    color: vars.color.text,
    backgroundColor: vars.color.fillTertiary,
  },
});

export const icon = style({ width: 12, height: 12 });

export const previewPair = style({
  display: "flex",
  width: 40,
  height: 24,
  borderRadius: RADIUS.md,
  overflow: "hidden",
  border: `1px solid ${vars.color.border}`,
  background: vars.constant.checkerboard,
});

export const previewCell = style({ flex: 1 });

export const actionRow = style({
  display: "flex",
  gap: "6px",
  marginTop: 2,
});
