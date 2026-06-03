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
`cssVariables: { colorSchemeSelector: "media" }` — dark mode is driven by
`prefers-color-scheme`.

---

## 2. Color Tokens

All palette values are defined in `src/components/Layout/ThemeProvider.tsx` and
exposed as MUI CSS variables (`var(--mui-palette-*)`).

### Light Mode

| Semantic Role                              | Token                           | Hex       |
| ------------------------------------------ | ------------------------------- | --------- |
| Primary (interactive, links, progress bar) | `--mui-palette-primary-main`    | `#1976d2` |
| Primary light                              | `--mui-palette-primary-light`   | `#42a5f5` |
| Primary dark                               | `--mui-palette-primary-dark`    | `#1565c0` |
| Secondary / Series indicators              | `--mui-palette-secondary-main`  | `#9333ea` |
| Secondary light                            | `--mui-palette-secondary-light` | `#c084fc` |
| Secondary dark                             | `--mui-palette-secondary-dark`  | `#7e22ce` |
| Success / Published posts                  | `--mui-palette-success-main`    | `#22c55e` |
| Warning / Draft posts                      | `--mui-palette-warning-main`    | `#f97316` |
| Info / Active / In-progress                | `--mui-palette-info-main`       | `#3b82f6` |

### Dark Mode (system palette — do not hard-code)

| Role      | `main` value |
| --------- | ------------ |
| Primary   | `#90caf9`    |
| Secondary | `#ce93d8`    |
| Success   | `#66bb6a`    |
| Warning   | `#ffa726`    |
| Info      | `#29b6f6`    |

### Selection / Highlight

```css
::selection {
  background-color: rgb(95 183 255 / 50%);
}
.selection-highlight {
  background-color: rgb(95 183 255 / 50%);
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

Font family: **`"Roboto", "Helvetica", "Arial", sans-serif`**\
Weights loaded: 300, 400, 500, 700 (via `@fontsource/roboto`).

| Variant     | Size     | Weight | Line Height | Notes                                          |
| ----------- | -------- | ------ | ----------- | ---------------------------------------------- |
| `h1`        | 2.5rem   | 700    | 1.2         | Letter-spacing -0.02em                         |
| `h2`        | 2rem     | 700    | 1.25        | Letter-spacing -0.01em                         |
| `h3`        | 1.75rem  | 600    | 1.3         |                                                |
| `h4`        | 1.5rem   | 600    | 1.35        |                                                |
| `h5`        | 1.25rem  | 600    | 1.4         | Default card title size                        |
| `h6`        | 1.125rem | 600    | 1.45        |                                                |
| `body1`     | 1rem     | 400    | 1.6         | Editor paragraph baseline                      |
| `body2`     | 0.875rem | 400    | 1.6         | Card excerpts, secondary text                  |
| `subtitle1` | 1rem     | 500    | 1.5         |                                                |
| `subtitle2` | 0.875rem | 500    | 1.5         |                                                |
| `caption`   | 0.75rem  | 400    | 1.5         | Letter-spacing 0.02em                          |
| `overline`  | 0.75rem  | 600    | 1.5         | Uppercase, letter-spacing 0.08em               |
| `button`    | —        | 600    | —           | `textTransform: "none"`, letter-spacing 0.02em |

**Rule**: Use MUI `<Typography variant="…">` — never hard-code `font-size` or
`font-weight` in `sx` when a variant matches.

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

These are defined in `src/components/DocumentCardNew/theme.ts`
(`createCardTheme`).

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
| Blog post card         | `DocumentCardNew`                       |
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

Body / UI: **Roboto** (loaded via `@fontsource/roboto`).\
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

| Context                                | Prop                    |
| -------------------------------------- | ----------------------- |
| Default UI (buttons, menus, dialogs)   | omit — defaults to `24` |
| Dense UI (toolbars, chips, table rows) | `size={18}`             |
| Large decorative                       | `size={32}`             |

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

## 15. Quick-Reference Cheat Sheet

```
Primary blue:     #1976d2  (light #42a5f5 / dark #1565c0)
Secondary purple: #9333ea  (light #c084fc / dark #7e22ce)
Success green:    #22c55e  → Published
Warning orange:   #f97316  → Draft
Info blue:        #3b82f6  → Active/In-progress
Border radius:    8px cards/buttons, 6px chips, 4px images
Spacing unit:     8px (use MUI units 1–4 for 8–32px)
Font:             Roboto 300/400/500/700
Min touch target: 48px
Focus ring:       0 0 0 3px alpha(primary, 0.25)
Selection:        rgb(95 183 255 / 50%)
Progress bar:     #1976d2 (NProgress, 3px, fixed top)
Component lib:    MUI v6 only — no Tailwind, no shadcn
```
