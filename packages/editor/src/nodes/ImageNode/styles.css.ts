/**
 * The image node's two pieces of presentation that used to be MUI components.
 *
 * Named `styles.css.ts` rather than `index.css.ts` deliberately: a `.css.ts`
 * may not share its stem with a `.css` in the same directory, and this folder
 * already has `index.css`. TypeScript would resolve `./index.css` to the `.ts`
 * while webpack resolved it to the literal stylesheet, so the exported class
 * would be `undefined` at runtime with every checker green.
 *
 * `index.css` keeps everything positional. The eight resize handles are placed
 * by `.image-resizer-{n,ne,e,se,s,sw,w,nw}` there — corner offsets, the
 * `translate(±50%)` that centres each on its corner, and the per-handle
 * cursor — and that is the half `ImageResizer`'s pointer math is written
 * against. Only the handle's *appearance* lives here.
 */
import { style } from "@vanilla-extract/css";
import { vars } from "../../styles/tokens.css";

/**
 * A resize grip.
 *
 * Was `<Radio checked>` — a MUI radio used purely for its glyph, which is why
 * `index.css` had to undo its icon (`.image-resizer svg { … }`) and its
 * padding. A `<button>` is what it always was semantically: `handlePointerDown`
 * already types its event as `React.PointerEvent<HTMLButtonElement>`, because
 * MUI's `Radio` is a `ButtonBase` underneath.
 *
 * The fill is `currentColor` so the grip keeps taking its color from
 * `.image-resizer`'s `color: var(--doc-selection-accent)` in `index.css` — the
 * same custom property that draws the selection outline around the image, so
 * the two cannot drift. The ring is the canvas, which is what makes the grip
 * readable over a dark photograph, and it flips with the scheme.
 */
export const resizeHandle = style({
  boxSizing: "border-box",
  display: "block",
  width: "14px",
  height: "14px",
  margin: 0,
  borderRadius: "50%",
  border: `2px solid ${vars.color.bg}`,
  backgroundColor: "currentColor",
  appearance: "none",
  WebkitAppearance: "none",
});

/**
 * The caption's placeholder. Was `<Typography color="text.secondary">`, whose
 * only two contributions here were the secondary ink and `<p>`'s reset margin
 * — everything positional is `.nested-placeholder` in `index.css`.
 */
export const captionPlaceholder = style({
  margin: 0,
  color: vars.color.textSecondary,
});
