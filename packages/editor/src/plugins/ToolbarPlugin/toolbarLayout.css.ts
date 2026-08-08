import { style } from "@vanilla-extract/css";

/**
 * `TextFormatToggles` no longer takes an MUI `sx`, so the one layout property
 * the toolbar was passing it moves here. The rest of `ToolbarPlugin` is still
 * MUI and stays that way until the tranche that restyles it.
 *
 * ## Why this is not called `toolbar.css.ts`
 *
 * There is already a plain `toolbar.css` in this directory, imported for side
 * effects at the top of `index.tsx`. `import { x } from "./toolbar.css"` then
 * means two different files depending on who is resolving: TypeScript prefers
 * `toolbar.css.ts` and type-checks happily, while webpack finds the literal
 * `toolbar.css` first and hands back a CSS module with no `x` in it — so the
 * class is `undefined` at runtime and the element silently loses its styling,
 * with every checker green. `npm run check:unused` is what surfaced it, by
 * reporting the `.css.ts` as a file nothing imports.
 *
 * The rule for the rest of phase 2: **a `.css.ts` may not share its stem with
 * a `.css` in the same directory.** Six more plain stylesheets are still in
 * this package (`grep -rl --include='*.css'`), and each is one paste away from
 * the same trap.
 */
export const noShrink = style({ flexShrink: 0 });
