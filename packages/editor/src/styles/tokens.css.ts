/**
 * The editor package's vanilla-extract token contract.
 *
 * Phase 2 of docs/plans/archive/haklex-adoption.md: the editor's interior adopts
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
     * Accent at low alpha — focus rings and the "this control is open" wash.
     * haklex spells this `accentLight` and defines it as the accent hex with an
     * `20` suffix; ours is the same idea through the channel variable, so it
     * follows the palette rather than pinning a second blue.
     */
    accentSoft: "ed-accent-soft",
    /** Legible ink *on* an accent fill. Not `bg` — the palette decides. */
    accentContrast: "ed-accent-contrast",
    /**
     * Status colors, for `ui/alert`, `ui/badge` and the destructive variant of
     * `ui/action-button`. haklex carries its own `alertInfo`/`alertWarning`/
     * `alertCaution` hexes plus a second dark set; ours alias the four MUI
     * severities the app already renders alerts with, so a status means the
     * same thing inside the editor as outside it.
     *
     * Each has a `…Soft` companion — the same hue at the alpha a tinted
     * background wants. Written through `…mainChannel` for the same reason as
     * the fill ladder: one hue, two uses, no second literal.
     */
    danger: "ed-danger",
    dangerSoft: "ed-danger-soft",
    warning: "ed-warning",
    warningSoft: "ed-warning-soft",
    success: "ed-success",
    successSoft: "ed-success-soft",
    info: "ed-info",
    infoSoft: "ed-info-soft",
    /**
     * The 4-step interactive fill ladder — haklex's `fill` → `fillQuaternary`
     * scale (docs/plans/archive/haklex-adoption.md §5.3), retinted to our slate palette
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
  /**
   * Deliberately scheme-invariant values — DESIGN.md §19.3's "light islands",
   * given a home instead of being inferred.
   *
   * A hue slider is the sRGB hue circle. A checkerboard is what "transparent"
   * looks like. The ring around a picker thumb is white in both schemes
   * because it sits on top of an arbitrary user-chosen color, not on the
   * canvas. None of these may respond to the theme toggle, and every one of
   * them is a raw literal that `npm run check:theme` is right to reject
   * everywhere else.
   *
   * Putting them *here* is the point: they are assigned in both the light and
   * the dark block below, identically, so "this does not change with the
   * scheme" is a statement the contract makes out loud and `assignVars` type-
   * checks — rather than a literal hidden in a component file, or a checker
   * exemption that would also excuse the next real mistake.
   */
  constant: {
    /** The sRGB hue circle, left to right. */
    hueTrack: "ed-const-hue-track",
    /** The same circle as a wheel, for the "custom color" swatch. */
    hueWheel: "ed-const-hue-wheel",
    /** Alpha checkerboard — what "transparent" looks like. */
    checkerboard: "ed-const-checkerboard",
    /** The white ring and dark halo around a picker thumb. */
    thumbRing: "ed-const-thumb-ring",
    thumbShadow: "ed-const-thumb-shadow",
    /** Saturation/value square overlays: white to the left, black to the top. */
    satWhite: "ed-const-sat-white",
    satBlack: "ed-const-sat-black",
    /** The dim behind a modal. */
    scrim: "ed-const-scrim",
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
  accentSoft: "rgba(var(--mui-palette-primary-mainChannel) / 0.24)",
  accentContrast: "var(--mui-palette-primary-contrastText)",
  danger: "var(--mui-palette-error-main)",
  dangerSoft: "rgba(var(--mui-palette-error-mainChannel) / 0.12)",
  warning: "var(--mui-palette-warning-main)",
  warningSoft: "rgba(var(--mui-palette-warning-mainChannel) / 0.12)",
  success: "var(--mui-palette-success-main)",
  successSoft: "rgba(var(--mui-palette-success-mainChannel) / 0.12)",
  info: "var(--mui-palette-info-main)",
  infoSoft: "rgba(var(--mui-palette-info-mainChannel) / 0.12)",
  fill: "rgba(var(--mui-palette-text-primaryChannel) / 0.11)",
  fillSecondary: "rgba(var(--mui-palette-text-primaryChannel) / 0.08)",
  fillTertiary: "rgba(var(--mui-palette-text-primaryChannel) / 0.05)",
  fillQuaternary: "rgba(var(--mui-palette-text-primaryChannel) / 0.025)",
};

/**
 * Assigned unchanged in both blocks below — that repetition *is* the
 * declaration. See the `constant` group in the contract for why each one is
 * here rather than in a component's `.css.ts`.
 */
const constant = {
  hueTrack:
    "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
  hueWheel:
    "conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
  checkerboard: "repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 / 8px 8px",
  thumbRing: "#ffffff",
  thumbShadow: "rgba(0, 0, 0, 0.3)",
  satWhite: "#ffffff",
  satBlack: "#000000",
  scrim: "rgba(0, 0, 0, 0.5)",
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

createGlobalTheme(":root", vars, { color, shadow: shadowLight, constant });

globalStyle("html.dark", {
  vars: assignVars(vars, { color, shadow: shadowDark, constant }),
});
