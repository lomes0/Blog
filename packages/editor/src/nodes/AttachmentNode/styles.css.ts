/**
 * The attachment node's editing chrome: the file chip, its inline preview, and
 * the standalone content editor the attachment drawer also mounts.
 *
 * ## This is the *decorate()* half only
 *
 * DESIGN.md §19.4: an attachment renders through two layers. `exportDOM` emits
 * `.attachment-container` / `.attachment-preview` / `.attachment-icon`, which
 * are styled in `theme.css` and cover exported HTML, print and the
 * pre-hydration render at `/view/[id]`; that half already carries its
 * `html.dark` counterparts, and nothing here changes it. What you see while
 * editing is the React tree below, and it is the half that shipped light-in-
 * dark twice by being restyled apart from the other. Change one, check both.
 *
 * ## Two components with no kit equivalent
 *
 * `Skeleton` and `Collapse` were the only MUI pieces here with nothing in
 * `ui/` behind them, and they are defined in this file rather than promoted
 * into the kit. `ui/` is haklex's component set, ported so their phase-3 and
 * phase-4 code drops in unrewritten; putting two components *we* invented in
 * with them would make the directory stop meaning that, for one call site
 * each. If a third caller appears, that is the moment to move them.
 */
import { keyframes, style } from "@vanilla-extract/css";
import { DURATION, FONT, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

const MONO =
  `"SF Mono", "Monaco", "Inconsolata", "Fira Code", "Consolas", monospace`;

/* ── The chip ─────────────────────────────────────────────────────────────── */

export const root = style({
  display: "flex",
  flexDirection: "column",
  width: "40%",
  minWidth: "400px",
  margin: `${SPACE.xs} 0`,
  userSelect: "none",
});

/**
 * The file chip.
 *
 * Selected and expanded are `data-` attributes rather than variants of a
 * recipe, because `actions` below has to react to this element's `:hover` from
 * a sibling rule — which needs a stable class to point at, and a recipe hands
 * back a different one per variant combination.
 *
 * The tints: what was `alpha(primary.main, 0.12)` / `0.2` is the same two
 * mixes of `accent`, and what was `action.hover` / `action.selected` is the
 * fill ladder, which exists for exactly this (`styles/tokens.css.ts`). Neither
 * `grey.*` nor `primary.50` can come back — the first is the same color in
 * both schemes, the second resolves to nothing at all.
 */
export const chip = style({
  display: "inline-flex",
  alignItems: "center",
  gap: SPACE.sm,
  padding: `6px ${SPACE.md}`,
  border: `1px solid ${vars.color.border}`,
  borderRadius: RADIUS.lg,
  cursor: "pointer",
  color: vars.color.text,
  backgroundColor: vars.color.fillTertiary,
  transition: `background-color ${DURATION.base} ease, border-color ${DURATION.base} ease`,
  selectors: {
    "&:hover": {
      backgroundColor: vars.color.fill,
      borderColor: vars.color.textTertiary,
    },
    "&[data-selected='true']": {
      backgroundColor: `color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
      borderColor: vars.color.accent,
    },
    "&[data-selected='true']:hover": {
      backgroundColor: `color-mix(in srgb, ${vars.color.accent} 20%, transparent)`,
      borderColor: vars.color.accent,
    },
    /* The preview below carries the bottom edge when the chip is open. */
    "&[data-expanded='true']": {
      borderBottomWidth: 0,
      borderRadius: `${RADIUS.lg} ${RADIUS.lg} 0 0`,
    },
  },
});

export const fileIcon = style({
  color: vars.color.accent,
  display: "flex",
  alignItems: "center",
  fontSize: "20px",
});

export const fileInfo = style({ flex: 1, minWidth: 0 });

/** Was `<Typography variant="body2" noWrap>` — `noWrap` is these three rules. */
export const filename = style({
  margin: 0,
  fontSize: FONT.lg,
  fontWeight: 500,
  lineHeight: 1.3,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const meta = style({
  display: "block",
  margin: 0,
  fontSize: FONT.sm,
  lineHeight: 1.2,
  color: vars.color.textSecondary,
});

/**
 * The action row fades up on selection *or* on hovering the chip — the second
 * half was a nested `"& .attachment-actions"` inside the chip's `sx`, and is a
 * sibling selector here for the same reason `chip` is not a recipe.
 */
export const actions = style({
  display: "flex",
  gap: "2px",
  opacity: 0.3,
  transition: `opacity ${DURATION.base} ease`,
  selectors: {
    "&[data-selected='true']": { opacity: 1 },
    [`${chip}:hover &`]: { opacity: 1 },
  },
});

/* ── The inline preview ───────────────────────────────────────────────────── */

/**
 * Replaces `<Collapse in unmountOnExit>`.
 *
 * The `0fr`/`1fr` grid row is the one way to animate to *content* height in
 * pure CSS — MUI's version measures the child and writes a pixel height from
 * JS on every frame. The child must be the only row and must clip, which is
 * what `collapseInner` is for.
 *
 * One deliberate difference from `unmountOnExit`: the content stays mounted
 * while closed. Nothing here depends on unmounting — the fetch and the
 * highlight both live in `AttachmentPreview` itself, outside this wrapper —
 * and the parent only mounts the whole component when the node is expanded or
 * being edited, so a closed-and-mounted preview is a frame during the
 * animation rather than a state a document sits in.
 */
export const collapse = style({
  display: "grid",
  gridTemplateRows: "0fr",
  transition: `grid-template-rows 200ms ease`,
  selectors: {
    "&[data-open='true']": { gridTemplateRows: "1fr" },
  },
});

export const collapseInner = style({ overflow: "hidden", minHeight: 0 });

export const previewFrame = style({
  border: `1px solid ${vars.color.border}`,
  borderRadius: `0 0 ${RADIUS.lg} ${RADIUS.lg}`,
  backgroundColor: vars.color.bgSecondary,
  overflow: "hidden",
});

export const previewPadding = style({ padding: SPACE.lg });

/**
 * Replaces `<Skeleton variant="text">`. MUI's default is a pulse on a
 * scheme-aware tint; this is the same two ideas, with the tint taken from the
 * fill ladder so it reads as a placeholder on either canvas.
 */
const pulse = keyframes({
  "0%": { opacity: 1 },
  "50%": { opacity: 0.4 },
  "100%": { opacity: 1 },
});

export const skeletonLine = style({
  height: "1.2em",
  marginBottom: "6px",
  borderRadius: RADIUS.sm,
  backgroundColor: vars.color.fill,
  animation: `${pulse} 1.5s ease-in-out 0.5s infinite`,
});

export const codePane = style({
  margin: 0,
  padding: `${SPACE.xl} ${SPACE.lg} ${SPACE.lg}`,
  backgroundColor: vars.color.fillTertiary,
  color: vars.color.text,
  borderRadius: RADIUS.sm,
  overflow: "auto",
  maxHeight: "400px",
  fontSize: "0.85rem",
  fontFamily: MONO,
  lineHeight: 1.5,
});

export const codePaneWrapper = style({ position: "relative" });

/**
 * The "showing the first N lines" band, and the header of the standalone
 * editor. Both were `warning.light` paper with `warning.contrastText` ink —
 * a pair that reads as a yellow block in light and, because `warning.light` is
 * a fixed near-yellow, as a glaring one in dark. The soft/solid pair is how
 * `ui/alert` states the same severity, and it is scheme-aware.
 */
export const warningBand = style({
  padding: SPACE.sm,
  backgroundColor: vars.color.warningSoft,
  color: vars.color.warning,
  borderRadius: `0 0 ${RADIUS.sm} ${RADIUS.sm}`,
  textAlign: "center",
  fontSize: FONT.sm,
});

export const inlineLink = style({
  cursor: "pointer",
  textDecoration: "underline",
});

/** The "file too large for an inline preview" notice. */
export const tooLarge = style({
  marginTop: SPACE.sm,
  padding: SPACE.lg,
  backgroundColor: vars.color.fillTertiary,
  borderRadius: RADIUS.md,
  color: vars.color.textSecondary,
  fontSize: FONT.lg,
});

export const tooLargeText = style({ margin: 0 });

/* ── The standalone content editor ────────────────────────────────────────── */

export const editorRoot = style({
  display: "flex",
  flexDirection: "column",
  height: "100%",
});

export const editorHeader = style({
  padding: `${SPACE.sm} ${SPACE.lg}`,
  backgroundColor: vars.color.warningSoft,
  color: vars.color.warning,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: SPACE.sm,
});

export const editorHeaderTitle = style({
  margin: 0,
  fontSize: FONT.lg,
  fontWeight: 500,
});

export const editorHeaderHint = style({ margin: 0, fontSize: FONT.sm });

export const editorBody = style({
  flex: 1,
  display: "flex",
  position: "relative",
  overflow: "hidden",
});

/**
 * The gutter. `grey.*` would be the obvious fill and is the mistake this file
 * is annotated against — it is `#fafafa` in dark too. The fill ladder's
 * "selected" step is the scheme-aware version of the same intent.
 */
export const editorGutter = style({
  width: "50px",
  backgroundColor: vars.color.fill,
  borderRight: `1px solid ${vars.color.border}`,
  overflow: "hidden",
  padding: `${SPACE.sm} ${SPACE.xs}`,
  fontFamily: MONO,
  fontSize: "0.85rem",
  lineHeight: 1.5,
  color: vars.color.textSecondary,
  textAlign: "right",
  userSelect: "none",
});

/**
 * `bg` rather than `bgSecondary`: this is a field, and the app's
 * `background.input` is the default canvas color in both schemes, which is
 * what keeps the textarea lifted above the panel around it.
 */
export const editorTextArea = style({
  flex: 1,
  padding: SPACE.sm,
  margin: 0,
  border: "none",
  outline: "none",
  resize: "none",
  fontFamily: MONO,
  fontSize: "0.85rem",
  lineHeight: 1.5,
  backgroundColor: vars.color.bg,
  color: vars.color.text,
  overflow: "auto",
  selectors: {
    "&:focus": { outline: "none" },
    "&:disabled": {
      backgroundColor: vars.color.fillQuaternary,
      color: vars.color.textTertiary,
    },
  },
});

export const editorFooter = style({
  padding: SPACE.sm,
  borderTop: `1px solid ${vars.color.border}`,
  display: "flex",
  gap: SPACE.sm,
  justifyContent: "flex-end",
  backgroundColor: vars.color.bgSecondary,
});

/**
 * Padding only — the ink and the type size come from `ui/dialog`'s own
 * `description`, and two single-class rules setting the same property would be
 * decided by stylesheet order rather than by intent.
 */
export const dialogBody = style({ padding: `0 ${SPACE.lg} ${SPACE.md}` });
