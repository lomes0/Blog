/**
 * Layout for the seven `Tools/` components, for the shapes the kit has no
 * primitive for. Local rather than in `ui/` for the reason
 * `Dialogs/styles.css.ts` records: a rule with one consumer is layout, not a
 * component.
 *
 * The stem is `tools`, and there is deliberately no `tools.css` beside it —
 * see the header of `../toolbarLayout.css.ts` for what a shared stem does.
 *
 * Colors come from `styles/tokens.css.ts`; `npm run check:theme` reads this
 * file and rejects a literal.
 */
import { globalStyle, style } from "@vanilla-extract/css";
import { FONT, RADIUS, SPACE } from "../../../styles/scale";
import { vars } from "../../../styles/tokens.css";

/** MUI's `sm`, transcribed — the same breakpoint `Menus/menus.css.ts` uses. */
const UP_SM = "screen and (min-width: 600px)";

/**
 * A run of icon buttons that used to be a `ToggleButtonGroup`.
 *
 * The connected, boxed look is gone for the reason `textFormatToggles.css.ts`
 * records: the kit's buttons are ghost by default and read as a row of
 * affordances. `flexShrink: 0` because these sit in the toolbar's scrolling
 * middle, which would otherwise squeeze them.
 */
export const toolGroup = style({
  display: "flex",
  alignItems: "center",
  gap: "2px",
  flexShrink: 0,
});

/**
 * `MathTools`' first group carried `position: relative` on the MUI element, and
 * the free-hand panel below is positioned against whatever ancestor is
 * positioned — so the property is load-bearing and is transcribed rather than
 * dropped.
 */
export const anchoredToolGroup = style([toolGroup, { position: "relative" }]);

/** Several groups side by side — `ImageTools`, `MathTools`. */
export const toolCluster = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.xs,
  flexWrap: "wrap",
  justifyContent: "center",
  zIndex: 1000,
  "@media": {
    [UP_SM]: { justifyContent: "flex-start", flexWrap: "nowrap" },
  },
});

/** The text/background colour pair. */
export const colorPair = style({
  display: "flex",
  alignItems: "center",
  gap: "2px",
  flexShrink: 0,
});

/**
 * A row of icon toggles inside a menu popup — the alignment and float rows
 * `TableTools` and `NoteTools` used to express as a `MenuItem` wrapping a
 * `ToggleButtonGroup`.
 *
 * Deliberately not a `Menu.Item`: Base UI registers items into a composite list
 * and moves DOM focus between them, and a row holding three buttons cannot be
 * one stop in that list without swallowing the buttons' own clicks. Same
 * reasoning as the font-size stepper in `Menus/menus.css.ts`.
 */
export const menuToggleRow = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "2px",
  padding: `${SPACE.xs} ${SPACE.sm}`,
});

/* A toggle in that row draws its glyph at the button's own size, not the 1rem
   `applyItemSvgStyles` forces on a menu item's icon column. */
globalStyle(`${menuToggleRow} svg`, { flexShrink: 0 });

/* ── ImageTools: the size-and-alignment popover ────────────────────────── */

/**
 * The panel behind the image toolbar's `Scaling` trigger.
 *
 * A popover rather than three more buttons in the row: `ImageTools` already
 * renders up to eight, and `toolCluster` stops wrapping at 600px, so anything
 * added inline is width the toolbar does not have. haklex reaches for the same
 * shape (`ImageLayoutControls.tsx`) and for the same reason.
 */
export const layoutPanel = style({
  display: "flex",
  flexDirection: "column",
  gap: SPACE.sm,
  padding: SPACE.sm,
  minWidth: 236,
});

export const layoutSection = style({
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xs,
});

export const layoutLabel = style({
  fontSize: FONT.xs,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: vars.color.textTertiary,
  padding: `0 ${SPACE.xs}`,
});

/**
 * The one sentence that keeps align and float distinguishable. Having both
 * controls is confusing precisely until someone says what the difference is,
 * so the panel says it rather than leaving it to the icons.
 */
export const layoutHint = style({
  fontSize: FONT.xs,
  lineHeight: 1.4,
  color: vars.color.textSecondary,
  padding: `0 ${SPACE.xs}`,
});

export const layoutRow = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.xs,
});

/** One of three alignment toggles, sharing the panel's width equally. */
export const layoutOption = style({
  flex: 1,
  minWidth: 0,
});

/** `Auto`, and the four percent presets. */
export const widthPreset = style([layoutOption, {
  padding: `0 ${SPACE.xs}`,
  fontSize: FONT.sm,
  fontVariantNumeric: "tabular-nums",
}]);

/** The slider, its ticks and its readout share one row. */
export const sizeSliderWrap = style({
  position: "relative",
  display: "flex",
  alignItems: "center",
  flex: 1,
  minWidth: 0,
});

/**
 * A range input, drawn against the token contract.
 *
 * The fill is a gradient stop driven by a `--fill` custom property the
 * component sets, because `::-webkit-slider-runnable-track` has no progress
 * pseudo-element the way Firefox's `::-moz-range-progress` does.
 */
export const sizeSlider = style({
  appearance: "none",
  WebkitAppearance: "none",
  width: "100%",
  height: 12,
  margin: 0,
  background: "transparent",
  cursor: "pointer",
  selectors: {
    "&::-webkit-slider-runnable-track": {
      height: 4,
      borderRadius: RADIUS.sm,
      background:
        `linear-gradient(to right, ${vars.color.accent} var(--fill), ${vars.color.fill} var(--fill))`,
    },
    "&::-webkit-slider-thumb": {
      WebkitAppearance: "none",
      appearance: "none",
      width: 12,
      height: 12,
      marginTop: -4,
      borderRadius: "50%",
      backgroundColor: vars.color.accent,
      border: `2px solid ${vars.color.bgSecondary}`,
    },
    "&::-moz-range-track": {
      height: 4,
      borderRadius: RADIUS.sm,
      backgroundColor: vars.color.fill,
    },
    "&::-moz-range-progress": {
      height: 4,
      borderRadius: RADIUS.sm,
      backgroundColor: vars.color.accent,
    },
    "&::-moz-range-thumb": {
      width: 12,
      height: 12,
      borderRadius: "50%",
      backgroundColor: vars.color.accent,
      border: `2px solid ${vars.color.bgSecondary}`,
    },
    "&:focus-visible": {
      outline: `2px solid ${vars.color.accent}`,
      outlineOffset: 2,
    },
  },
});

/** A preset's mark on the track. Positioned by `imageLayout.tickOffset`. */
export const sizeSliderTick = style({
  position: "absolute",
  top: "50%",
  width: 2,
  height: 2,
  marginTop: 3,
  borderRadius: "50%",
  backgroundColor: vars.color.textQuaternary,
  pointerEvents: "none",
  transform: "translate(-50%, -50%)",
});

export const sizeValue = style({
  minWidth: 38,
  textAlign: "right",
  fontSize: FONT.sm,
  fontVariantNumeric: "tabular-nums",
  color: vars.color.textSecondary,
});

/** The font-size stepper: a compact `NumberStepperField`, toolbar-sized. */
export const fontSizeRoot = style({ flexShrink: 0 });

export const fontSizeInput = style({
  width: 46,
  fontSize: FONT.md,
  fontWeight: 600,
  padding: `0 ${SPACE.xs}`,
  MozAppearance: "textfield",
  selectors: {
    "&::-webkit-inner-spin-button, &::-webkit-outer-spin-button": {
      appearance: "none",
      margin: 0,
    },
  },
});

/* ── MathTools ─────────────────────────────────────────────────────────── */

/*
 * Wolfram's orange stays an inline `style` on the button in `MathTools.tsx`,
 * exactly where the `sx` that preceded it was. It is a brand mark rather than
 * a theme colour, so it may not come from `vars`; and a raw literal here would
 * fail `npm run check:theme`, correctly — that rule cannot tell a vendor logo
 * from a colour someone forgot to tokenise, and weakening it for this one
 * button would excuse the next real mistake.
 */

/**
 * The free-hand drawing panel. MUI's `Paper` plus its `sx`, transcribed: fixed
 * to the foot of the viewport on a phone, and hung under the toolbar once
 * there is room.
 */
export const drawPanel = style({
  position: "fixed",
  bottom: SPACE.xs,
  top: "auto",
  left: "50%",
  transform: "translateX(-50%)",
  width: "calc(100% - 2px)",
  maxWidth: 1000,
  height: 294.5,
  zIndex: 1000,
  borderRadius: RADIUS.md,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  boxShadow: vars.shadow.menu,
  "@media": {
    [UP_SM]: { position: "absolute", top: 56, bottom: "auto" },
  },
});

/**
 * Excalidraw is mounted here only as a scratch surface for the OCR round trip,
 * so its own chrome is hidden — the toolbar's stroke tools stay, everything
 * else goes. Verbatim from the `sx` this replaces.
 */
globalStyle(
  `${drawPanel} :is(.layer-ui__wrapper, .mobile-misc-tools-container, .App-bottom-bar, .popover, .LaserToolOverlay)`,
  { display: "none !important" },
);

globalStyle(
  `${drawPanel} .App-toolbar .Stack > :not(:nth-child(7), :nth-child(10))`,
  { display: "none !important" },
);

globalStyle(`${drawPanel} canvas`, { borderRadius: RADIUS.sm });

export const drawSave = style({
  position: "absolute",
  right: SPACE.sm,
  bottom: SPACE.sm,
  zIndex: 1000,
});

export const drawProgress = style({
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 1000,
});

/** The read-only `math-field` under the LaTeX box in the edit dialog. */
export const mathPreview = style({
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xs,
});

globalStyle(`${mathPreview} math-field`, {
  width: "auto",
  margin: "0 auto",
});

/* ── AITools ───────────────────────────────────────────────────────────── */

/**
 * The typed-instruction field at the head of the AI menu, with its send button
 * tucked into the corner. Not a `Menu.Item` — see `menuToggleRow`.
 */
export const promptRow = style({
  position: "relative",
  display: "flex",
  width: 256,
  padding: `0 ${SPACE.xs} ${SPACE.xs}`,
});

export const promptInput = style({
  paddingRight: 40,
});

export const promptSend = style({
  position: "absolute",
  right: SPACE.sm,
  bottom: SPACE.sm,
});

/** The model row: provider icon, model name, then "Change". */
export const modelRow = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: SPACE.lg,
  backgroundColor: vars.color.fillQuaternary,
  borderBottom: `1px solid ${vars.color.border}`,
  marginBottom: SPACE.xs,
});

export const modelName = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.sm,
  fontWeight: 500,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const modelChange = style({
  fontSize: FONT.xs,
  color: vars.color.textSecondary,
});
