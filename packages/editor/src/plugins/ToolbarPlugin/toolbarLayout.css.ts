/**
 * The document toolbar's own layout — what `ToolbarPlugin/index.tsx` expressed
 * as MUI `Box`/`Divider` `sx` blocks, plus the handful of rules that used to
 * live in the plain `toolbar.css` beside it.
 *
 * ## Why `toolbar.css` is gone
 *
 * That file was a design handoff transcribed as CSS, and all but its first
 * block addressed MUI class names — `.MuiIconButton-root`, `.MuiToggleButton-*`,
 * `.MuiOutlinedInput-*`, `#insert-button`, `#ai-tools-button`. This commit
 * removes the last MUI component from the package, so every one of those
 * selectors now matches nothing, and its `--tb-*` token pair had no remaining
 * reader. What it actually specified — a 34px control, a 7-8px radius, an
 * accent-soft "selected" wash, a quiet hover — is the kit's `action-button`
 * recipe, drawn from `--ed-*`, and keeping a second private token set beside it
 * would be two answers to one question.
 *
 * The class name `editor-toolbar` stays on the element regardless of styling:
 * `nodes/MathNode/MathComponent.tsx` uses `relatedTarget.closest(".editor-toolbar")`
 * to tell "focus left the math field for the toolbar" from "focus left it for
 * the document", and that check is behaviour, not presentation.
 *
 * ## Why this is not called `toolbar.css.ts`
 *
 * It was named around the file above even after that file's deletion, and the
 * rule stands for the rest of the package: **a `.css.ts` may not share its stem
 * with a `.css` in the same directory.** `import { x } from "./toolbar.css"`
 * means two different files depending on who resolves it — TypeScript prefers
 * `toolbar.css.ts` and type-checks happily, while webpack finds the literal
 * `toolbar.css` first and hands back a CSS module with no `x` in it, so the
 * class is `undefined` at runtime with every checker green. `npm run
 * check:unused` is what surfaced it, by reporting the `.css.ts` as a file
 * nothing imports. Six more plain stylesheets are still in this package
 * (`grep -rl --include='*.css'`), and each is one paste away from the trap.
 */
import { style } from "@vanilla-extract/css";
import { SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

/** For a child that must not be squeezed by the scrolling middle. */
export const noShrink = style({ flexShrink: 0 });

export const bar = style({
  display: "flex",
  alignItems: "center",
  gap: "2px",
  minHeight: 52,
  padding: `${SPACE.xs} ${SPACE.md}`,
  overflow: "hidden",
  backgroundColor: vars.color.bg,
  borderBottom: `1px solid ${vars.color.border}`,
  fontFamily: '"Hanken Grotesk", system-ui, sans-serif',
  WebkitFontSmoothing: "antialiased",
  "@media": {
    print: { display: "none" },
  },
});

/**
 * One at each end. The toolbar's contents are centred by two greedy spacers
 * rather than `justify-content`, so the scrolling middle can still grow into
 * the space when there is more in it than fits.
 */
export const spacer = style({ flex: 1 });

/** A run of controls that travels together and does not shrink. */
export const cluster = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.xs,
  flexShrink: 0,
});

/** MUI's vertical `Divider`, inset top and bottom. */
export const divider = style({
  width: "1px",
  alignSelf: "stretch",
  margin: `6px ${SPACE.sm}`,
  flexShrink: 0,
  backgroundColor: vars.color.border,
});

/**
 * The scrolling middle. Its scrollbar is hidden rather than styled: the row is
 * one control tall, so a bar under it would take a third of the height, and
 * everything in here is reachable from the keyboard without it.
 */
export const scroller = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.xs,
  overflow: "auto",
  scrollbarWidth: "none",
  selectors: {
    "&::-webkit-scrollbar": { display: "none" },
  },
});
