# DESIGN.md — Design Contract

> **Agents**: Reference this file in every UI prompt.\
> "Follow DESIGN.md conventions when implementing any component or page."

## How to read this file

This document has two halves, and they carry different authority.

**Codified sections — the code is the source of truth, this file describes it.**
§2 colors · §3 typography · §4 spacing · §5 radius · §6 shadows · §7 breakpoints
· §11 motion · §12 scrollbars · §13 print · §14 fonts · §16 icons · §17.1/.3/.4
surfaces, tints and density.

For these, the value lives in exactly one place in code and this file points at
it. **Do not restate a value here that the code owns** — a number written in two
places is a second source of truth, and the copy in Markdown is the one nothing
validates. Where a table below still lists concrete values (the palette hexes,
the type scale) it is a *rendering* of the theme for humans reading in one
place; if it disagrees with the theme, the theme is right and this file is a bug.

**Checklist sections — no machine enforces these; a reviewer does.** §1 library
choice · §8 naming · §9 required states · §10 accessibility · §17.5/.6 process
and scope. Nothing can be codified into a token here: "handle the empty state"
and "icon-only buttons need `aria-label`" are properties of a component's logic,
not of its style values. These are a review checklist, and they are not weaker
for it — they are just enforced by reading.

### Where a value lives

| Home                            | What belongs there                                     |
| ------------------------------- | ------------------------------------------------------ |
| `ThemeProvider.tsx`             | Palette (incl. `accent`), typography scale             |
| `src/theme/components.ts`       | Anything MUI can apply as a component default          |
| `src/theme/tokens.ts`           | Motion, shadows, focus rings, touch target             |
| `src/theme/icons.ts`            | lucide `size` values (`ICON_SIZE`)                     |
| `src/app/globals.css`           | Global CSS: scrollbars, print, selection, reduced-motion |
| `sx` at the call site           | Only what is genuinely local to that one component     |

Section numbers are cited from code comments, so they are stable: a retired
section's number is not reused. (There is no §15 — the cheat sheet that held
that number is now §18.)

---

## 1. Component Library

This project uses **Material UI (MUI) v6** with Emotion.\
Do **not** introduce Radix, shadcn/ui, Tailwind, Chakra, or any other UI
library.

```
@mui/material       ^6.5.0
@mui/icons-material ^6.4.8
@mui/x-charts       ^7.28.0
@emotion/react      ^11.14.0
@emotion/styled     ^11.14.1
```

Theme provider: `src/components/Layout/ThemeProvider.tsx` — palette, typography
scale, and wiring.\
Component defaults: `src/theme/components.ts` — the rules below expressed as MUI
`defaultProps`/`styleOverrides`, so they apply without a call site opting in.\
Cross-cutting tokens: `src/theme/tokens.ts` (`MOTION`, `SHADOW`, `FOCUS_RING`,
`TOUCH_TARGET`) — values a call site must compose by hand, that MUI has no
`components` slot for.\
Icon sizes: `src/theme/icons.ts` (`ICON_SIZE`) — lucide bypasses the theme, so
that map is the only way to reach the scale in §16.

> **Where a rule belongs.** If the same style literal appears in more than one
> file, it is a default that was never set — move it to `src/theme/components.ts`
> rather than pasting it a third time. A `!important` in an `sx` is the same
> signal: it means a component's own rule outranks the call site, which the
> theme can restate at equal specificity instead. Reserve `sx` for what is
> genuinely local to one component.

MUI CSS variables are enabled with
`cssVariables: { colorSchemeSelector: "class" }` — dark mode is applied via an
`html.dark` class injected by `InitColorSchemeScript`.

> **CSS rule:** use `html.dark .selector { … }` for dark overrides. Do **not**
> use `@media (prefers-color-scheme: dark)` — that signal is independent of the
> in-app theme toggle.

---

## 2. Color Tokens

All palette values are defined in `src/components/Layout/ThemeProvider.tsx` and
exposed as MUI CSS variables (`var(--mui-palette-*)`).

> **Source spec:** the "Slate + Indigo" palette
> (`claude_design/blog-editor-tokens.css`) is the design reference. It is
> **not** imported — its `--accent`/`--bg-*` names and `data-theme="dark"`
> selector are mapped onto this project's MUI tokens and `html.dark` scheme
> instead. The spec's green "Active" badge intentionally diverges from this
> project, where Active = `info` blue (see Status Gradients).

### Light Mode

| Semantic Role                              | Token                           | Hex       |
| ------------------------------------------ | ------------------------------- | --------- |
| Primary (interactive, links, progress bar) | `--mui-palette-primary-main`    | `#4f46e5` |
| Primary light                              | `--mui-palette-primary-light`   | `#6366f1` |
| Primary dark                               | `--mui-palette-primary-dark`    | `#463eca` |
| Secondary / Series indicators              | `--mui-palette-secondary-main`  | `#9333ea` |
| Secondary light                            | `--mui-palette-secondary-light` | `#c084fc` |
| Secondary dark                             | `--mui-palette-secondary-dark`  | `#7e22ce` |
| Success / Published posts                  | `--mui-palette-success-main`    | `#059669` |
| Warning / Draft posts                      | `--mui-palette-warning-main`    | `#f97316` |
| Info / Active / In-progress                | `--mui-palette-info-main`       | `#3b82f6` |

### Neutrals (Slate)

| Role            | Token                              | Light     | Dark      |
| --------------- | ---------------------------------- | --------- | --------- |
| Canvas / page   | `--mui-palette-background-default` | `#ffffff` | `#252b3a` |
| Surface / paper | `--mui-palette-background-paper`   | `#f8fafc` | `#303849` |
| Activity rail   | `--mui-palette-background-rail`    | `#eceef2` | `#1b202c` |
| Sidebar / nav   | `--mui-palette-background-sidebar` | `#f8fafc` | `#202634` |
| Panel (Copilot) | `--mui-palette-background-panel`   | `#fbfcfe` | `#2a3141` |
| Input field     | `--mui-palette-background-input`   | `#ffffff` | `#363f52` |
| Divider         | `--mui-palette-divider`            | `#e2e8f0` | `#465166` |

> **Chrome surfaces** (`sidebar`/`panel`/`input`) are recessed/lifted variants
> of `paper`, added by augmenting MUI's `TypeBackground` in `ThemeProvider.tsx`.
> Use them for the left nav (`AppDrawer`/`SideBar`), the right Copilot panel /
> `RightRail`, and prompt/search fields — **not** raw hexes. There is **no**
> `chip` or `accent-weak` token: selected rows, count pills, and hover fills use
> MUI's built-in `action.selected` / `action.hover`. | Text primary |
> `--mui-palette-text-primary` | `#0f172a` | `#f1f3f7` | | Text secondary |
> `--mui-palette-text-secondary` | `#475569` | `#adb7c5` | | Text disabled |
> `--mui-palette-text-disabled` | `#94a3b8` | `#737f90` |

### Explorer Accent (`palette.accent`)

A slightly more violet take on `primary`, used by the activity rail, file tree
and count pills. Reach it like any palette entry — `sx={{ color: "accent.main" }}`
— which resolves to a scheme-aware `var(--mui-palette-accent-*)`.

| Key              | Light                                | Dark                       |
| ---------------- | ------------------------------------ | -------------------------- |
| `main`           | `#6d5cf5`                            | `primary.main`             |
| `hover`          | `#5d4ce8`                            | `primary.dark`             |
| `tint`           | `#eeecfe`                            | `action.selected`          |
| `activeText`     | `#4338ca`                            | `primary.main`             |
| `pillBg`         | `#f4f4f6`                            | `action.hover`             |
| `pillText`       | `#a1a1aa`                            | `text.disabled`            |
| `pillActiveBg`   | `#dfdcff`                            | `action.selected`          |
| `avatarGradient` | `linear-gradient(135deg,#8b7bff,#6d5cf5)` | primary light → main  |

The dark column is written as references, not fresh hexes: the accent's dark
form *is* the lifted brand indigo plus the neutral action tints. `avatarGradient`
is a gradient rather than a colour, so it is read as
`var(--mui-palette-accent-avatarGradient)` rather than through an `sx` palette
path.

> This was `SB_ACCENT` in `components/Layout/SideBar/constants.ts`: fixed
> light-mode hexes applied through `theme.applyStyles("light", …)`, so dark mode
> fell through to whatever the base `sx` happened to set. That made it a second
> palette — invisible to the theme, unreachable from `sx` strings, and
> dark-incomplete by construction. It is a palette decision, so it lives in the
> palette.

### Dark Mode (system palette — do not hard-code)

| Role      | `main` value |
| --------- | ------------ |
| Primary   | `#8b85f4`    |
| Secondary | `#ce93d8`    |
| Success   | `#34d399`    |
| Warning   | `#ffa726`    |
| Info      | `#29b6f6`    |

### Applying alpha to tokens (CSS variables)

Because `cssVariables` is enabled, `theme.palette.primary.main` resolves to a
**fixed hex for the default color scheme** — so
`alpha(theme.palette.primary.main, n)` is _not_ scheme-aware (it bakes the light
value into both modes). For a translucent accent that tracks the active scheme,
use the auto-generated channel variable instead:

```css
rgba(var(--mui-palette-primary-mainChannel) / 0.5)
```

For scheme-specific branches inside `sx`, use `theme.applyStyles("dark", { … })`
— **not** `theme.palette.mode === "dark"`, which reflects the SSR/default mode
under CSS variables and will not react to the in-app theme toggle.

### Selection / Highlight

```css
::selection {
  background-color: rgb(79 70 229 / 22%);
}
.selection-highlight {
  background-color: rgb(79 70 229 / 22%);
}
```

### Status Gradients (used in cards / chips)

| Status    | Background gradient                                 | Border token     |
| --------- | --------------------------------------------------- | ---------------- |
| Draft     | `linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)` | `warning.main`   |
| Published | `linear-gradient(135deg, #f0fdf4 0%, #bbf7d0 100%)` | `success.main`   |
| Active    | `linear-gradient(135deg, #eff6ff 0%, #bfdbfe 100%)` | `info.main`      |
| Done      | `linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)` | `text.secondary` |
| Series    | `linear-gradient(135deg, #faf5ff 0%, #e9d5ff 100%)` | `secondary.main` |

---

## 3. Typography Scale

Font family: **`"Public Sans", "Roboto", "Helvetica", "Arial", sans-serif`**\
Weights loaded: 300, 400, 500, 600, 700 (via `@fontsource/public-sans`).

| Variant     | Size      | Weight | Line Height | Notes                                                                      |
| ----------- | --------- | ------ | ----------- | -------------------------------------------------------------------------- |
| `h1`        | 2.5rem    | 700    | 1.2         | Letter-spacing -0.02em                                                     |
| `h2`        | 2rem      | 700    | 1.25        | Letter-spacing -0.01em                                                     |
| `h3`        | 1.75rem   | 600    | 1.3         |                                                                            |
| `h4`        | 1.5rem    | 600    | 1.35        |                                                                            |
| `h5`        | 1.25rem   | 600    | 1.4         | Default card title size                                                    |
| `h6`        | 1.125rem  | 600    | 1.45        |                                                                            |
| `body1`     | 1rem      | 400    | 1.6         | Editor paragraph baseline                                                  |
| `body2`     | 0.875rem  | 400    | 1.6         | Card excerpts, secondary text                                              |
| `subtitle1` | 1rem      | 500    | 1.5         |                                                                            |
| `subtitle2` | 0.875rem  | 500    | 1.5         |                                                                            |
| `caption`   | 0.75rem   | 400    | 1.5         | Letter-spacing 0.02em                                                      |
| `dense`     | 0.8125rem | 400    | 1.5         | **Custom.** 13px — toolbars, table rows, dense labels                      |
| `micro`     | 0.6875rem | 400    | 1.5         | **Custom.** 11px — timestamps, counters, meta chips; letter-spacing 0.02em |
| `overline`  | 0.75rem   | 600    | 1.5         | Uppercase, letter-spacing 0.08em                                           |
| `button`    | —         | 600    | —           | `textTransform: "none"`, letter-spacing 0.02em                             |

`dense` and `micro` are project-specific variants (declared via module
augmentation in `src/components/Layout/ThemeProvider.tsx`) that fill the gap
below `body2`. They render inline (`<span>`) by default — pass `component="p"`
for a block.

**Rules**:

1. Use MUI `<Typography variant="…">` — never hard-code `font-size` in `sx` when
   a variant matches. If a needed size is missing, **add a theme variant**, do
   not inline a literal.
2. On non-`Typography` elements (Button, Chip, Box, MenuItem, `sx:` props,
   nested selectors), reach the same scale via the **`typography` sx shortcut**:
   `sx={{ typography: "dense" }}`. It pulls size + line-height + letter-spacing
   from the theme, so the theme stays the single source of truth.
3. Raw inline `style={{}}` (e.g. `<pre>` code viewers) can't use the shortcut —
   those are an exception, not a precedent for new UI.

---

## 4. Spacing Grid

MUI default: **1 spacing unit = 8px**.

| MUI unit | px   |
| -------- | ---- |
| 0.5      | 4px  |
| 1        | 8px  |
| 1.25     | 10px |
| 1.5      | 12px |
| 2        | 16px |
| 2.5      | 20px |
| 3        | 24px |
| 3.5      | 28px |
| 4        | 32px |

Common patterns in this codebase:

```tsx
gap: 1; // 8px  — tight lists / icon rows
gap: 2; // 16px — default card content gap
gap: 2.5; // 20px — section spacing
p: 3.5; // 28px — card content padding
```

Do **not** introduce arbitrary pixel values when an MUI spacing unit exists.

---

## 5. Border Radius

| Use case                    | Value                                              | Where applied                                |
| --------------------------- | -------------------------------------------------- | -------------------------------------------- |
| Card, Paper, Button, Dialog | `8px` (= MUI `borderRadius: 1` in `px` or `8` raw) | `MuiCard`, `MuiButton`, `MuiPaper` overrides |
| Chip                        | `6px`                                              | `MuiChip` override                           |
| Circular / avatar           | `"50%"`                                            | avatar-like elements                         |
| Image within cards          | `4px` (`borderRadius: 4` as a raw px value)        | `cardTheme.image.borderRadius` — **unread**  |
| Fine-grained card border    | `6` (MUI units)                                    | `createCardTheme`                            |

> **`sx` multiples are ×4, not ×8.** There is **no `shape.borderRadius`
> override**, so MUI's default `4px` base applies: `borderRadius: 1` → **4px**,
> `1.5` → 6px, `2` → 8px, `2.5` → 10px, `3` → 12px. (Component overrides set
> Card/Button/Paper `root` to a raw `8px` and Chip to `6px`.) **Canonical inline
> radii:** controls/chips `1.5` (6px), cards/buttons/panels `2` (8px), floating
> overlays `2.5`–`3` (10–12px), images `1` (4px), pills/circular `"50%"`.

**Never use values outside this set** without a strong reason.

---

## 6. Shadows & Elevation

Prefer MUI `elevation` props over custom box-shadows. When a raw `box-shadow` is
genuinely required, take it from **`SHADOW` in `src/theme/tokens.ts`**:

- `SHADOW.card.rest` / `SHADOW.card.hover` — interactive cards.
- `SHADOW.raised.light` / `.dark` — chips and small lifted surfaces. This one is
  a **scheme pair**: a shadow tuned for a white canvas reads as nothing on a
  `#252b3a` one. `raisedShadow(theme)` applies both branches at once — but only
  where the same object literal has no other `applyStyles("dark", …)`, since
  those collide on one selector key and the later spread wins.

`createCardTheme` re-exposes `shadow.default`/`hover`/`focus` from these tokens
so existing card call sites keep working; new code should reach for the tokens.

> These used to be defined *in* `createCardTheme`, i.e. a global rule living
> inside one component's folder. `shadow.default` and `shadow.focus` had zero
> readers as a result, while unrelated surfaces hand-rolled their own — two
> competing "default shadow" definitions and six spellings of one transition.

---

## 7. Layout & Breakpoints

MUI default breakpoints apply:

| Key  | Min-width                                      |
| ---- | ---------------------------------------------- |
| `xs` | 0px                                            |
| `sm` | 600px                                          |
| `md` | 900px                                          |
| `lg` | 1200px                                         |
| `xl` | 1536px (overridden to 2400px for `maxWidthXl`) |

The `xl` container is extended to `2400px` via `MuiContainer` override — allow
full-bleed layouts on large screens.

**Toolbar-aware scroll offset:**\
Elements that can be jumped to via anchor links must set:

```css
scroll-margin-top: calc(56px + 1rem); /* mobile (<600px) */
scroll-margin-top: calc(64px + 1rem); /* ≥600px */
```

(Already handled globally for `.editor-container` children — replicate in any
new anchored section.)

---

## 8. Component Naming Conventions

Use **PascalCase** for component files and exports. Follow the existing
directory structure:

```
src/components/
  ComponentName/           ← directory when component has sub-files
    index.tsx              ← default export
    theme.ts               ← component-local theme tokens (optional)
    components/            ← sub-components scoped to this component
  SingleFileComponent.tsx  ← flat file for simple, self-contained components
```

**Existing canonical names — do not invent synonyms:**

| Concept                | Canonical component name                |
| ---------------------- | --------------------------------------- |
| Blog post card         | `DocumentCard`                          |
| Post list view         | `PostsList`                             |
| Series display (grid)  | `SeriesGrid`                            |
| Series display (card)  | `SeriesCard`                            |
| Series detail view     | `SeriesView`                            |
| Post/doc actions menu  | `DocumentActions` / `SeriesActions`     |
| Cloud sync button      | `SyncToCloudFab`                        |
| Sidebar/nav drawer     | `AppDrawer`                             |
| Document browser modal | `DocumentBrowser`                       |
| Edit view wrapper      | `EditDocument`                          |
| Standalone editor      | `Playground`                            |
| Bin / soft-delete UI   | `TrashBin`                              |
| Sticky notes canvas    | `NotesCanvas`                           |
| Rich text editor       | `Editor` (Lexical-based, `src/editor/`) |

---

## 9. States to Always Handle

Every data-dependent component **must** handle all four states:

| State        | Implementation                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| **Loading**  | MUI `<Skeleton>` or `<CircularProgress>` — use `EditorSkeleton` for editor-area skeletons                  |
| **Empty**    | Descriptive empty-state message + optional CTA button; never render a blank space                          |
| **Error**    | MUI `<Alert severity="error">` with a human-readable message; wrap async boundaries with `<ErrorBoundary>` |
| **Disabled** | Set `disabled` prop on interactive MUI elements; never rely solely on visual opacity                       |

---

## 10. Accessibility Baseline

Target: **WCAG AA minimum**.

- **Focus rings**: `FOCUS_RING.card(theme)` (3px at 25%, for cards and anything
  with room around it) or `FOCUS_RING.chrome` (2px at 60%, for dense tree rows,
  tabs and rail buttons) from `src/theme/tokens.ts`. Both pair with
  `outline: "none"`.
- **Minimum touch target**: 48×48px — `TOUCH_TARGET` in `src/theme/tokens.ts`.
- **Color contrast**: All text must pass AA against its background. Never convey
  state by color alone — pair with an icon or label.
- **Interactive elements**: Must have an accessible label (`aria-label`,
  `aria-labelledby`, or visible text). Icon-only buttons require `aria-label`.
- **Keyboard navigation**: All interactive elements must be reachable and
  operable via keyboard. Do not suppress `onKeyDown` events without providing an
  alternative.
- **Semantic HTML**: Prefer MUI components that render semantic elements
  (`<Button>` → `<button>`, `<Link>` → `<a>`). Do not use `div` + `onClick`
  where a `button` applies.

---

## 11. Animation & Motion

Durations and easing come from **`MOTION` in `src/theme/tokens.ts`**:

| Token           | Value                          | Use                                    |
| --------------- | ------------------------------ | -------------------------------------- |
| `MOTION.fast`   | 150ms (MUI `duration.shortest`) | hover, opacity, colour                 |
| `MOTION.base`   | 200ms (MUI `duration.shorter`)  | the ceiling for a micro-interaction    |
| `MOTION.layout` | 340ms                          | container moves (sidebar width slide)  |
| `MOTION.easing` | `cubic-bezier(0.4, 0, 0.2, 1)` (MUI `easing.easeInOut`) | everything |

These *are* MUI's own values, named. Prefer `theme.transitions.create()`; reach
for `MOTION` when writing a raw CSS transition string. Do not invent a duration
— the codebase had converged on 150/200ms by hand, just spelled six ways.

**`prefers-reduced-motion` is handled globally** in `src/app/globals.css`: all
animation and transition durations collapse to 1ms under
`@media (prefers-reduced-motion: reduce)`. Individual components no longer need
to guard their own animations. (1ms rather than `none` so `transitionend` /
`animationend` listeners still fire.)

---

## 12. Scrollbars

Thin auto-hiding scrollbars are applied globally:

```css
/* WebKit */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

/* Firefox */
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}
```

The dark scheme has its own thumb (`rgba(255,255,255,0.22)`, keyed off
`html.dark` per §2) — a thumb tuned for a white canvas is invisible on a
`#252b3a` one. This section previously described the light rules as applying
"globally", which was only ever true in light mode.

Do not override these per-component unless strictly required (e.g. hidden
scrollbar for a masonry canvas).

---

## 13. Print Styles

The editor output is print-ready. Global print rules in `src/app/globals.css`:

- Page size: A4, margin 0.5in.
- Only `.editor-container` is visible — all other UI elements are
  `display: none`.
- Color-adjust is forced exact.
- Avoid `break-inside: avoid` on `h1–h6`, `img`, `pre`, `code` — already set
  globally.

New components that should survive printing must be placed inside
`.editor-container` or explicitly un-hidden in print media.

---

## 14. Fonts

Body / UI: **Public Sans** (loaded via `@fontsource/public-sans`).\
Editor code blocks: `Menlo, Consolas, Monaco, monospace`.\
Excalidraw sketches: `Virgil` (loaded from
`/fonts/Virgil/Virgil-Regular.woff2`).\
Code block monospace: `Cascadia` (loaded from `/public/fonts/Cascadia/`).

Do not import additional font families without updating `src/app/globals.css`
and `src/components/Layout/ThemeProvider.tsx`.

---

## 16. Icons

This project uses **`lucide-react`** for all icons.

```tsx
import { IconName } from "lucide-react";
```

### Size

lucide bypasses the MUI theme, so icon sizes come from the `ICON_SIZE` token map
in `src/theme/icons.ts` — the single source of truth. Pass a token, never a raw
number:

```tsx
import { ICON_SIZE } from "@/theme/icons";
<Save size={ICON_SIZE.inline} />;
```

| Token               | px | Context                                        |
| ------------------- | -- | ---------------------------------------------- |
| `ICON_SIZE.micro`   | 12 | Micro affordances: meta counters, hover icons  |
| `ICON_SIZE.inline`  | 14 | Inline with dense text, button start/end icons |
| `ICON_SIZE.dense`   | 18 | Dense UI: toolbars, chips, table rows          |
| `ICON_SIZE.default` | 24 | Default UI: buttons, menus, dialogs            |
| `ICON_SIZE.large`   | 32 | Large decorative                               |
| `ICON_SIZE.display` | 64 | Empty-state / hero glyphs                      |

Do **not** apply these to MUI `CircularProgress`/`Skeleton` `size=` — that's an
element diameter, not an icon glyph, and stays a raw number.

### Color

Lucide icons inherit `currentColor` from their parent by default — no prop
needed in most cases. For explicit color overrides, pass `style`:

```tsx
<AlertCircle style={{ color: "var(--mui-palette-error-main)" }} />;
```

Do **not** use MUI `color` prop values — they do not apply to lucide icons.

### Stroke width

Default is `2`. Use `strokeWidth={1.5}` only for large decorative icons (e.g.
empty-state illustrations). Never change stroke width in dense UI.

### Migration note

`SvgIcon` from `@mui/material` (not `@mui/icons-material`) remains in use in
`src/editor/plugins/ToolbarPlugin/Tools/TableTools.tsx` for 31 custom Google
Material Symbols paths. This is intentional. The `@mui/icons-material` package
has been removed; `@mui/material` stays.

---

## 17. IDE Surface Spec (chrome conformance map)

The app shell is an IDE: **activity rail · sidebar · editor top bar · tabs ·
command palette · status bar · Copilot panel**. These surfaces must read as **one
system**. This section pins the exact token for every chrome element so the
whole-app consistency sweep has a single, unambiguous target. Sections 2–6 define
the tokens; this section says **which token goes where**. Conform code to this —
no ad-hoc `fontSize`, `rgba()`, or radius literals in chrome.

### 17.1 Region surfaces & borders

| Region                        | Background token                   | Border                          |
| ----------------------------- | ---------------------------------- | ------------------------------- |
| Activity rail (far left, 54px)| `background.rail` (recessed/darker)| `1px solid divider` (right)     |
| Sidebar / Explorer / Search   | `background.sidebar`               | `1px solid divider` (right)     |
| Editor top bar                | `background.default`               | `1px solid divider` (bottom)    |
| Editor body / canvas          | `background.default`               | none                            |
| Command palette overlay       | `background.paper`                 | `1px solid divider`, elev. shadow |
| Copilot / AI panel + RightRail| `background.panel`                 | `1px solid divider` (left)      |
| Status bar (bottom, 26px)     | `background.sidebar`               | `1px solid divider` (top)       |
| Inputs (search, palette field)| `background.input`                 | `1px solid divider`             |

### 17.2 Typography per element (no hard-coded sizes)

Reach the scale via `<Typography variant>` or `sx={{ typography: "…" }}` — never
a literal `fontSize`.

| Element                                   | Variant     | Notes                              |
| ----------------------------------------- | ----------- | ---------------------------------- |
| Section headers ("EXPLORER", "AI ASSISTANT")| `overline`| uppercase, tracked, `text.disabled`|
| File/tree rows, tab labels, search results| `dense`     | mono stack for `*.md` names        |
| Breadcrumb, top-bar controls              | `dense`     |                                    |
| Status-bar items, counts, meta chips, dirty-dot labels | `micro` | 11px                     |
| Palette command labels                    | `body2`     |                                    |
| Palette shortcut hints / `esc` chip       | `micro`     | mono                               |
| Post title (front-matter / doc)           | `h4`/`h5`   | per existing scale                 |

Colours for these surfaces come from `palette.accent` (§2), not from a
sidebar-local constant.

> **Sidebar carve-out.** The left sidebar has a **user-adjustable text size**
> (`useSidebarFontSize`, Settings +/- controls): the drawer paper sets a `px`
> base and rows size in **`em`** so they track the user's scale. Fixed
> `dense`/`micro` variants would break that, so sidebar rows are **exempt** from
> the "no hard-coded fontSize" rule. Instead they use the single `SB_FONT` ratio
> ladder (`SideBar/constants.ts`: `meta` 0.72em · `body` 0.9em · `emphasis`
> 1.2em) — do not inline other `em`/`rem`/`px` sizes in the sidebar.

Monospace uses **Cascadia** (already bundled for code blocks; `@font-face` in
`globals.css`) via `MONO_FONT` (`SideBar/constants.ts` =
`"Cascadia", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`). It is
reserved for **file-system cues only**: `*.md` filenames, folder/path strings,
palette shortcuts, front-matter. Never for prose or generic labels.

### 17.3 Interaction state tints (one vocabulary everywhere)

No hand-mixed `rgba()`. Every rail button, tree row, tab, menu item, and list
result uses the same states:

| State          | Token / pattern                                              |
| -------------- | ------------------------------------------------------------ |
| Rest           | `transparent`                                                |
| Hover          | `action.hover`                                               |
| Selected / active row | `action.selected`                                     |
| Active accent bar (rail item, active tab, active file) | 2px `primary.main` inset bar via `::before` |
| Scheme-aware accent tint (when a literal is unavoidable) | `rgba(var(--mui-palette-primary-mainChannel) / <a>)` |
| Explorer accent surfaces | `accent.main` / `accent.tint` / `accent.activeText` (§2) |
| Focus ring     | `FOCUS_RING.chrome` for dense chrome; `FOCUS_RING.card(theme)` for cards (§10) |

> **Open question — `FOCUS_RING.chrome` is not `inset`.** This table used to
> specify an inset ring for dense chrome, but the only implementation of it
> (`ActivityRail`) draws it outset, and the token matches the shipped rendering
> rather than silently redrawing an accessibility-visible element. Whether the
> spec or the code is right needs a human with the app in front of them.

**Tree rows are codified — do not re-derive them.** This table's states have no
MUI slot (a tree row is a plain `Box`/`ListItemButton`), so they lived only as
prose and five files answered them independently. They are now `sx` fragments in
`src/theme/treeRow.ts`; compose those rather than writing the literal:

| State                          | Fragment                                    |
| ------------------------------ | ------------------------------------------- |
| Reorder insertion line         | `dropIndicatorSx(position)` (needs `position: relative`) |
| Drop-into-container fill       | `dropIntoSx()` — add your own outline/rule on top |
| Multi-selection pill           | `multiSelectSx(alsoWhen?)`                  |
| Keyboard focus                 | `chromeFocusRingSx(keepFillWhen?)`          |
| Hover-revealed row controls    | `rowHoverRevealSx`                          |
| Row radius (§17.4)             | `TREE_ROW_RADIUS`                           |
| Row state transition (§11)     | `ROW_TRANSITION`                            |

> **Second open question — the tree-row focus ring is an `outline`, not
> `FOCUS_RING.chrome`.** The table above names that token, but every shipped
> tree row draws an outline and `ActivityRail` is its only user.
> `chromeFocusRingSx` matches what ships. Reconciling the two forms is the same
> kind of accessibility-visible call as the `inset` question.

### 17.4 Radius & density

| Element                        | Radius                | Height / metric        |
| ------------------------------ | --------------------- | ---------------------- |
| Rail icon button               | none (full-bleed)     | 44px tall, full width; tint spans full width, 2px accent bar on left edge |
| Tree / list / result row       | `1.5` (6px)           | ~28–32px               |
| Tab                            | `1.5` (6px) top only  | matches top-bar height |
| Top-bar search pill, inputs    | `1.5` (6px)           | ~32px                  |
| Palette overlay                | `3` (12px)            | —                      |
| Floating menus (block/align)   | `2.5` (10px)          | —                      |
| Buttons / cards / panels       | `2` (8px)             | —                      |

Menus are a solved case: `MuiMenu`/`MuiMenuItem` in `src/theme/components.ts`
set the surface (translucent paper + `blur(8px)` + elevation 2) and the row
density (`body2`, 6px/14px padding, icon hugging its label). A menu needs no
`slotProps.paper` blob, no `menuItemSx`, and no `primaryTypographyProps` — pass
`divider` for a separator rule and `sx` only for what is unique to that menu.

Icon sizes come from `ICON_SIZE` (§16): rail = `default` (24), dense chrome
(tree/tabs/toolbar) = `dense` (18), inline-with-text = `inline` (14),
meta/counters = `micro` (12). Never raw numbers — there are currently **zero**
raw `size={N}` props on lucide icons anywhere in `src`, and it is worth keeping
that number at zero rather than letting it drift back.

### 17.5 Sweep rule

When touching any chrome file: replace every hard-coded `fontSize` with a variant
(17.2), every `rgba()` state fill with a token (17.3), and every off-scale
`borderRadius` with the canonical value (17.4 / §5). If a needed size is missing,
**add a theme variant** — do not inline a literal (§3.1).

### 17.6 Scope — chrome only

§17 governs the **IDE chrome** (17.1's regions). Application **content** is not
chrome and keeps its own typographic intent — do **not** force-conform it. The
following are deliberate, not drift: sticky-note styling (`NotesCanvas`, colored
paper + fixed dark ink), home **preview miniatures** (`*PreviewCard`, `KanbanBoard`
intentional 10–14px), raw `<pre>` **code viewers** (§3.3 exception, syntax-theme
colors), **avatar** initial sizing, bespoke card/list labels that pair a base
variant with custom weight/tracking (e.g. `-0.01em`/`0.08em`), and idiomatic
`boxShadow: … rgba(0,0,0,x)` (§6). Tune these per-component on their own merits.

---

## 18. Quick-Reference Cheat Sheet

```
Primary indigo:   #4f46e5  (light #6366f1 / dark #463eca)
Explorer accent:  #6d5cf5  → palette.accent (dark = primary.main)
Secondary purple: #9333ea  (light #c084fc / dark #7e22ce)
Success green:    #059669  → Published
Warning orange:   #f97316  → Draft
Info blue:        #3b82f6  → Active/In-progress
Canvas/Surface:   #ffffff / #f8fafc  (dark #252b3a / #303849)
Text/Divider:     #0f172a text, #e2e8f0 divider (slate)
Border radius:    8px cards/buttons, 6px chips, 4px images
Spacing unit:     8px (use MUI units 1–4 for 8–32px)
Font:             Public Sans 300/400/500/600/700
Min touch target: 48px          → TOUCH_TARGET
Focus ring:       0 0 0 3px alpha(primary, 0.25)  → FOCUS_RING.card
Motion:           150 / 200ms, cubic-bezier(.4,0,.2,1)  → MOTION
Icon sizes:       12 / 14 / 18 / 24 / 32 / 64  → ICON_SIZE
Selection:        rgb(79 70 229 / 22%)
Progress bar:     #4f46e5 (NProgress, 3px, fixed top)
Component lib:    MUI v6 only — no Tailwind, no shadcn
```

> Numbered 18, not 15: it used to sit at §15 but appear after §17. Section
> numbers are cited from code comments, so retired numbers are not reused.
