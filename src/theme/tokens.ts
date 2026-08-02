import { alpha, type Theme } from "@mui/material/styles";

/**
 * Cross-cutting style tokens that MUI has no `components` slot for.
 *
 * These exist because DESIGN.md §6 (shadows), §10 (focus ring, touch target)
 * and §11 (motion) are *global* rules, but the only place they were ever
 * written down in code was `components/DocumentCard/theme.ts` — a
 * component-local file. A rule that governs the whole app cannot live inside
 * one component's folder: every other surface either re-invents it or ignores
 * it, which is exactly what happened (six competing `transition` strings, two
 * competing "default shadow" definitions).
 *
 * Same test as `./components.ts`: if the same literal appears in more than one
 * file, it is a default that was never set. Sizes that MUI cannot reach live in
 * `./icons`; component *defaults* belong in `./components.ts`. This file is for
 * values a call site must compose by hand.
 */

/**
 * Motion — DESIGN.md §11 (≤200ms for micro-interactions).
 *
 * These are MUI's own `transitions` values, named. `fast`/`base` are
 * `duration.shortest`/`shorter` and `easing` is `easing.easeInOut` verbatim —
 * the codebase had already converged on them by hand (`"0.15s"`, `"0.2s"`,
 * `cubic-bezier(.4,0,.2,1)`), just spelled six different ways across
 * twenty-odd files. Prefer `theme.transitions.create()` where you can; reach
 * for these when you are writing a raw CSS transition string.
 */
export const MOTION = {
  /** 150ms — hover, opacity, color. MUI `duration.shortest`. */
  fast: 150,
  /** 200ms — the §11 ceiling for a micro-interaction. MUI `duration.shorter`. */
  base: 200,
  /**
   * 340ms — container layout moves (the sidebar width slide). Deliberately
   * above the §11 ceiling: resizing a region is not a micro-interaction.
   */
  layout: 340,
  /** `cubic-bezier(0.4, 0, 0.2, 1)` — MUI `easing.easeInOut`, verbatim. */
  easing: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

/**
 * Shadows — DESIGN.md §6. Prefer an `elevation` prop; these are for the cases
 * where a raw `box-shadow` is genuinely required.
 *
 * Scheme-aware by construction: a shadow tuned for a white canvas reads as
 * nothing on a `#252b3a` one, so `raised` is a light/dark pair rather than a
 * single string. Use the `raisedShadow()` helper to apply both at once.
 */
export const SHADOW = {
  /** Chips / small lifted surfaces. */
  raised: {
    light: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
    dark: "0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)",
  },
  /** Interactive cards at rest and on hover. */
  card: {
    rest: "0 4px 12px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
    hover: "0 12px 32px rgba(0,0,0,0.15), 0 6px 16px rgba(0,0,0,0.1)",
  },
} as const;

/**
 * `SHADOW.raised` as an `sx` fragment with the dark-scheme branch attached.
 *
 * Spread into an `sx` callback: `sx={(theme) => ({ ...raisedShadow(theme) })}`.
 *
 * **One `applyStyles("dark")` per object literal.** `theme.applyStyles` returns
 * a single-key object (the scheme selector), so spreading this *and* another
 * `applyStyles("dark", …)` as siblings makes the second silently overwrite the
 * first — the shadow, or the other rule, just vanishes. When the same literal
 * already has a dark branch, add `boxShadow: SHADOW.raised.dark` to that branch
 * by hand instead of reaching for this helper.
 */
export const raisedShadow = (theme: Theme) => ({
  boxShadow: SHADOW.raised.light,
  ...theme.applyStyles("dark", { boxShadow: SHADOW.raised.dark }),
});

/**
 * Focus rings — DESIGN.md §10 (cards) and §17.3 (dense chrome).
 *
 * Both pair with `outline: "none"`. `chrome` is inset so it does not push
 * against a neighbouring row in a dense tree.
 */
export const FOCUS_RING = {
  /** 3px at 25% — cards, buttons, anything with room around it (§10). */
  card: (theme: Theme) =>
    `0 0 0 3px ${alpha(theme.palette.primary.main, 0.25)}`,
  /**
   * 2px at 60% — tree rows, tabs, rail buttons. Uses the channel variable so it
   * tracks the active color scheme, per §2's alpha note.
   *
   * NB: §17.3 specifies this `inset`; the only implementation of it
   * (`ActivityRail`) is not, and a focus ring is an accessibility-visible
   * element, so this matches the shipped rendering rather than silently
   * redrawing it. Whether the spec or the code is right is a call for a human
   * with the app in front of them.
   */
  chrome: "0 0 0 2px rgba(var(--mui-palette-primary-mainChannel) / 0.6)",
} as const;

/** Minimum touch target in px — DESIGN.md §10. */
export const TOUCH_TARGET = 48;

/**
 * A scroller with no visible scrollbar — DESIGN.md §12's named exception.
 *
 * §12 puts thin auto-hiding scrollbars on everything and says not to override
 * them per component "unless strictly required". The workspace is the case that
 * qualifies: its scroller is the page itself, so the bar is a permanent 6px rule
 * down the inside edge of the document — and in a split there are two of them,
 * one of which lands directly against the splitter it is easy to mistake for.
 *
 * Scrolling is untouched: the wheel, the keyboard, the scrollbar-less trackpad
 * gesture and `scrollTop` (which is how the scroll memory restores a document)
 * all still work. This hides the *indicator*, which is why it belongs to
 * full-height chrome that has other edges to say where it ends, and not to a
 * short overflowing box where the bar is the only clue there is more.
 */
export const hiddenScrollbarSx = {
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": { display: "none" },
} as const;
