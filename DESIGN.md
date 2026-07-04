# DESIGN.md — Machine-Readable Design Contract

> **Agents**: Reference this file in every UI prompt.\
> "Follow DESIGN.md conventions when implementing any component or page."

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

Theme provider: `src/components/Layout/ThemeProvider.tsx`\
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
| Canvas / page   | `--mui-palette-background-default` | `#ffffff` | `#0f121a` |
| Surface / paper | `--mui-palette-background-paper`   | `#f8fafc` | `#161c29` |
| Activity rail   | `--mui-palette-background-rail`    | `#eceef2` | `#080a11` |
| Sidebar / nav   | `--mui-palette-background-sidebar` | `#f8fafc` | `#0c0f18` |
| Panel (Copilot) | `--mui-palette-background-panel`   | `#fbfcfe` | `#0d1018` |
| Input field     | `--mui-palette-background-input`   | `#ffffff` | `#131621` |
| Divider         | `--mui-palette-divider`            | `#e2e8f0` | `#242b3c` |

> **Chrome surfaces** (`sidebar`/`panel`/`input`) are recessed/lifted variants
> of `paper`, added by augmenting MUI's `TypeBackground` in `ThemeProvider.tsx`.
> Use them for the left nav (`AppDrawer`/`SideBar`), the right Copilot panel /
> `RightRail`, and prompt/search fields — **not** raw hexes. There is **no**
> `chip` or `accent-weak` token: selected rows, count pills, and hover fills use
> MUI's built-in `action.selected` / `action.hover`. | Text primary |
> `--mui-palette-text-primary` | `#0f172a` | `#eef2f6` | | Text secondary |
> `--mui-palette-text-secondary` | `#475569` | `#9aa6b2` | | Text disabled |
> `--mui-palette-text-disabled` | `#94a3b8` | `#5f6b78` |

### Dark Mode (system palette — do not hard-code)

| Role      | `main` value |
| --------- | ------------ |
| Primary   | `#7b74ec`    |
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
| Image within cards          | `4px` (`borderRadius: 4` as a raw px value)        | `cardTheme.image.borderRadius`               |
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

Prefer MUI `elevation` props over custom box-shadows. When a custom shadow is
required (e.g. interactive cards), use:

```ts
shadow.default = "0 4px 12px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)";
shadow.hover = "0 12px 32px rgba(0,0,0,0.15), 0 6px 16px rgba(0,0,0,0.1)";
shadow.focus = `0 0 0 3px ${alpha(primary.main, 0.25)}`;
```

These are defined in `src/components/DocumentCard/theme.ts` (`createCardTheme`).

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

- **Focus rings**: `box-shadow: 0 0 0 3px alpha(primary.main, 0.25)` with
  `outline: none` — see `cardTheme.accessibility.focusRingWidth = 3`.
- **Minimum touch target**: 48×48px — see
  `cardTheme.accessibility.minimumTouchTarget = 48`.
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

Animations are **disabled** in card components (set to `"none"` / `"0ms"` in
`createCardTheme`).\
For any new animated element:

- Use `transition` durations ≤ 200ms for micro-interactions.
- Respect `prefers-reduced-motion` — wrap animations in:
  ```css
  @media (prefers-reduced-motion: no-preference) { … }
  ```

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
| Focus ring     | `box-shadow: 0 0 0 2px rgba(var(--mui-palette-primary-mainChannel) / 0.6)` inset for dense chrome; `3px` at `0.25` for cards (§10) |

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

Icon sizes come from `ICON_SIZE` (§16): rail = `default` (24), dense chrome
(tree/tabs/toolbar) = `dense` (18), inline-with-text = `inline` (14),
meta/counters = `micro` (12). Never raw numbers.

### 17.5 Sweep rule

When touching any chrome file: replace every hard-coded `fontSize` with a variant
(17.2), every `rgba()` state fill with a token (17.3), and every off-scale
`borderRadius` with the canonical value (17.4 / §5). If a needed size is missing,
**add a theme variant** — do not inline a literal (§3.1).

---

## 15. Quick-Reference Cheat Sheet

```
Primary indigo:   #4f46e5  (light #6366f1 / dark #463eca)
Secondary purple: #9333ea  (light #c084fc / dark #7e22ce)
Success green:    #059669  → Published
Warning orange:   #f97316  → Draft
Info blue:        #3b82f6  → Active/In-progress
Canvas/Surface:   #ffffff / #f8fafc  (dark #0f121a / #161c29)
Text/Divider:     #0f172a text, #e2e8f0 divider (slate)
Border radius:    8px cards/buttons, 6px chips, 4px images
Spacing unit:     8px (use MUI units 1–4 for 8–32px)
Font:             Public Sans 300/400/500/600/700
Min touch target: 48px
Focus ring:       0 0 0 3px alpha(primary, 0.25)
Selection:        rgb(79 70 229 / 22%)
Progress bar:     #4f46e5 (NProgress, 3px, fixed top)
Component lib:    MUI v6 only — no Tailwind, no shadcn
```
