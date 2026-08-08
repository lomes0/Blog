/**
 * The editor package's vanilla-extract token contract.
 *
 * Phase 2 of docs/plans/haklex-adoption.md: the editor's interior adopts
 * haklex's styling stack (vanilla-extract + Base UI) so their component code
 * ports directly, while the app shell stays on MUI + DESIGN.md. This file is
 * the seam between the two — everything inside `packages/editor` that is
 * restyled reaches for `vars.*`, and `vars.*` resolves to the app palette.
 *
 * ## Why the dark contract is keyed to `html.dark`
 *
 * DESIGN.md §19.1, and non-negotiable. That is the class MUI writes via
 * `InitColorSchemeScript` (`app/layout.tsx`) and `colorSchemeSelector: "class"`
 * (`Layout/ThemeProvider.tsx`), so it tracks the *in-app* toggle and is
 * SSR-safe. The two spellings this codebase has already shipped as silent
 * no-ops are banned by `npm run check:theme`, which as of this commit reads
 * `.css.ts` too:
 *
 *   - `[theme="dark"]` — nothing has set that attribute since `bc20ee77`
 *     (Jul 2024); ~90 lines of editor dark styling matched nothing for two
 *     years.
 *   - `[data-theme="dark"]` — how haklex's own `.css.ts` files spell it. Our
 *     app never sets that attribute either, so copied code must fail the
 *     checker rather than quietly match nothing.
 *   - `prefers-color-scheme` — reads the OS and ignores the toggle.
 *
 * ## Why a *global* contract and not `createTheme`'s scoped class
 *
 * `createTheme` returns a class name that has to be on an ancestor of the
 * styled element. Base UI popups portal to `document.body`, and our own
 * floating toolbar portals into an app-shell slot (`ToolbarSlotContext`) — both
 * escape any wrapper the editor could put the class on. haklex solves this with
 * a `PortalThemeWrapper`; keying to `:root` / `html.dark` means we do not need
 * one.
 *
 * ## Why the values are `var(--mui-palette-*)` aliases
 *
 * So the editor contract cannot drift from the app palette. Those variables
 * already flip with `html.dark` (`cssVariables` is on), which is why the color
 * half of the dark block below is a restatement rather than a second palette.
 * `src/theme/treeRow.ts` is the precedent. The one thing that genuinely needs
 * scheme-specific literals is the shadows — a drop tuned for a white canvas
 * reads as nothing on a `#252b3a` one.
 *
 * `assignVars` is what makes that safe to extend: it is typed against the whole
 * contract, so a token added above without a dark value is a *compile* error
 * rather than a color that stops responding to the toggle.
 */
import {
  assignVars,
  createGlobalTheme,
  createGlobalThemeContract,
  globalStyle,
} from "@vanilla-extract/css";

/**
 * Explicit `ed-*` names rather than vanilla-extract's generated hashes: the
 * emitted CSS has to stay greppable, because `scripts/check-theme.mjs` and the
 * build-output check in the phase gate both look for `--ed-` by name.
 */
export const vars = createGlobalThemeContract({
  color: {
    /** Body text. */
    text: "ed-text",
    /** Labels, captions, secondary chrome. */
    textSecondary: "ed-text-secondary",
    /** Placeholders, disabled labels. */
    textTertiary: "ed-text-tertiary",
    /** The faintest legible ink — separators with text in them, hints. */
    textQuaternary: "ed-text-quaternary",
    /** The editing canvas. */
    bg: "ed-bg",
    /** Anything raised off it: menus, popovers, cards. */
    bgSecondary: "ed-bg-secondary",
    /** Hairlines. */
    border: "ed-border",
    /** Selection, focus, the one saturated color in the editor. */
    accent: "ed-accent",
    /**
     * The 4-step interactive fill ladder — haklex's `fill` → `fillQuaternary`
     * scale (docs/plans/haklex-adoption.md §5.3), retinted to our slate palette
     * rather than imported with their neutral literals. This is the thing that
     * makes their components read as one system, and it is the gap
     * `src/theme/treeRow.ts` closed for tree rows only.
     *
     * Built from the text channel, the same construction MUI uses for
     * `action.hover`/`action.selected`: near-black tints on the light canvas,
     * near-white on the dark one, with no second set of literals to keep in
     * sync.
     */
    /** Selected row, or a list item under the pointer. */
    fill: "ed-fill",
    /** A control under the pointer — button, toolbar item. */
    fillSecondary: "ed-fill-secondary",
    /** A large area under the pointer — a block, a cell. */
    fillTertiary: "ed-fill-tertiary",
    /** The subtlest wash there is — zebra striping, inset wells. */
    fillQuaternary: "ed-fill-quaternary",
  },
  shadow: {
    /** Menus, popovers, dropdowns. */
    menu: "ed-shadow-menu",
    /** Dialogs and anything floating over the document. */
    modal: "ed-shadow-modal",
  },
});

/**
 * Scheme-agnostic by construction — every entry resolves through a
 * `--mui-palette-*` variable that already flips with `html.dark`, so this same
 * object is correct in both schemes and is assigned in both blocks below.
 */
const color = {
  text: "var(--mui-palette-text-primary)",
  textSecondary: "var(--mui-palette-text-secondary)",
  textTertiary: "var(--mui-palette-text-disabled)",
  textQuaternary: "rgba(var(--mui-palette-text-primaryChannel) / 0.35)",
  bg: "var(--mui-palette-background-default)",
  bgSecondary: "var(--mui-palette-background-paper)",
  border: "var(--mui-palette-divider)",
  accent: "var(--mui-palette-primary-main)",
  fill: "rgba(var(--mui-palette-text-primaryChannel) / 0.11)",
  fillSecondary: "rgba(var(--mui-palette-text-primaryChannel) / 0.08)",
  fillTertiary: "rgba(var(--mui-palette-text-primaryChannel) / 0.05)",
  fillQuaternary: "rgba(var(--mui-palette-text-primaryChannel) / 0.025)",
};

/**
 * `SHADOW.raised` and `SHADOW.floating` from `src/theme/tokens.ts`, transcribed
 * rather than imported: that module imports `alpha`/`Theme` from
 * `@mui/material/styles`, and a `.css.ts` file is *evaluated* by the
 * vanilla-extract compiler at build time, so importing it would drag MUI into
 * the style-compilation graph for two string constants. Keep the two in step by
 * hand; they are the only literals in this file.
 */
const shadowLight = {
  menu: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
  modal: "0 18px 40px -24px rgba(15,23,42,0.35)",
};

const shadowDark = {
  menu: "0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)",
  modal: "0 18px 40px -24px #0b0d17",
};

createGlobalTheme(":root", vars, { color, shadow: shadowLight });

globalStyle("html.dark", {
  vars: assignVars(vars, { color, shadow: shadowDark }),
});
