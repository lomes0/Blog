# Handoff: App Sidebar — Open & Collapsed States

## Overview
A redesign of the app's left navigation sidebar covering two states — **expanded (open)** and **collapsed** — plus a smooth slide transition between them. The sidebar contains: a brand header, primary nav (Posts / Notes), search, a collapsible folder tree of documents, and a user footer. The collapse behavior offers **three interchangeable rail directions** (the team should pick one).

## About the Design Files
The files in this bundle (`Sidebar.html` + the `.jsx` files it loads) are **design references created in HTML/React-via-Babel** — a prototype showing the intended look and behavior. They are **not production code to copy directly**.

The task is to **recreate these designs inside the target codebase** using its existing environment, component library, and patterns (e.g. your real React/Vue/Svelte components, your icon set, your CSS tokens). If no front-end environment exists yet, choose the most appropriate framework and implement there. Treat the HTML as the source of truth for *visuals and interaction*, not for *code structure*.

A live, runnable version is `Sidebar.html` — open it in a browser to feel the transitions, hover tooltips, and the Tweaks panel that toggles between rail styles.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, radii, and interactions are specified below to exact values. Recreate pixel-for-pixel using your codebase's existing primitives.

---

## States

### 1. Open (expanded) — default
Fixed width **300px** (tweakable 260–340). Vertical flex column, full viewport height, white background, 1px right border. Top-to-bottom regions:

| Region | Contents |
|---|---|
| Header | Brand logo tile + "Blog" wordmark |
| Primary nav | Posts (selected), Notes |
| Search | Pill input "Search posts…" |
| Tree (scrolls) | Folders with doc children, expand/collapse |
| Footer | Avatar + username + collapse button |

### 2. Collapsed
Animates to a narrow rail. The folder tree is **hidden**; primary nav and brand persist as icons; hovering any icon shows a **tooltip** to its right; clicking the logo, avatar, or expand arrows re-opens. Three directions (choose one — default is **Nav rail**):

- **A. Nav rail (default, width 64px):** logo → Posts/Notes icon buttons → divider → one folder icon per collection with a small count **badge** (e.g. `4`, `99+`) → avatar + expand arrows pinned bottom. Cleanest; tree collapses to folder entry points.
- **B. Recent (width 64px):** same top section, then a scrollable column of recent document icons (first ~9 of the active collection) → footer. Closest to a traditional file rail; good if quick doc access matters.
- **C. Minimal handle (width 18px):** sidebar reduces to a hairline; a floating reopen chevron button sits on its right edge, vertically centered. Maximizes content width.

---

## Layout & Components (exact specs)

### Header
- Container: `display:flex; align-items:center; gap:13px; padding:18px 16px 12px`.
- **Logo tile:** 44×44px, `border-radius:12px` (≈ 0.27×side), background `linear-gradient(160deg,#4b86f8,#2f6df6)`, shadow `0 2px 6px rgba(47,109,246,.30)`. Contains a white `</>` code glyph (~26px, stroke 2.1). Hover: lift `translateY(-1px)` + stronger shadow.
- **Wordmark "Blog":** 26px / weight 700 / letter-spacing −0.02em / color `#101114`.

### Primary nav rows
- Row: `height:46px` (×0.86 compact / ×1.14 comfy), `display:flex; align-items:center; gap:14px; padding:0 12px; border-radius:11px`.
- Label: 16px / weight 500 / letter-spacing −0.005em / color `#33343a`.
- Icon: 22px line icon, stroke 1.7, color `#3a3b41`.
- **Hover:** background `#f3f4f6`.
- **Selected:** background `#e8e9ec`, text `#0f1012`, icon `#16171a`.
- **Optional brand accent (off by default):** 3.5px-wide, 56%-tall rounded bar, color `var(--accent)`, at left inset 5px of the selected row.

### Search
- Wrapper padding `8px 14px 10px`.
- Field: `height:42px; padding:0 12px; gap:9px; border-radius:12px; background:#f1f2f4; border:1px solid transparent`.
- **Focus-within:** background `#fff`, border `#cfd6e4`, ring `0 0 0 3px rgba(47,109,246,.14)`.
- Magnifier icon 18px stroke 1.8 color `#9aa0a8`. Placeholder text `#9aa0a8`, input 15px.

### Folder tree
- Scroll area: `flex:1; overflow-y:auto; padding:2px 8px 8px`. Custom thin scrollbar (thumb `#d4d8df`, 8px, 2px transparent inset → pill).
- **Folder row:** `height:40px; gap:7px; padding:0 9px 0 7px; border-radius:9px`. Name 15px / weight 550 / `#2c2d32`. Count 13.5px / weight 500 / `#6f7e95` / tabular-nums, right-aligned. Chevron 15px color `#9097a1`, **rotates 0°→90°** on expand (transition `.22s cubic-bezier(.4,0,.2,1)`).
- **Folder children:** wrapped in a `max-height` transition (`.26s cubic-bezier(.4,0,.2,1)`) for expand/collapse.
- **Doc row:** `gap:10px; padding:0 10px 0 30px` (30px left indent under chevron); `border-radius:8px`. File icon 17px color `#9aa0aa`. Title 14.5px color `#41434a`, **truncated with ellipsis** (`white-space:nowrap; overflow:hidden; text-overflow:ellipsis`). Hover bg `#f3f4f6`. Selected bg `#e8e9ec`, text `#16171a`.

### Footer
- `display:flex; align-items:center; gap:11px; padding:11px 14px; border-top:1px solid #e9e9ec`.
- Avatar: 34px circle (use real user image; prototype uses a gradient placeholder).
- Username: 15.5px / weight 550 / `#26272b`.
- Collapse button: 34×34px, `border-radius:9px`, icon color `#8b9099` → hover bg `#f3f4f6` color `#3a3b41`. Icon = diagonal "collapse inward" arrows.

### Collapsed rail (common)
- Rail button: 44×44px, `border-radius:12px`, icon 21px color `#3a3b41`. Hover bg `#f3f4f6`. Selected bg `#e8e9ec`. 
- Badge (nav-rail folders): top-right, min 16px, `border-radius:8px`, bg `#eef1f6`, text `#5d6b82` 10px/weight 650; shows count or `99+`.
- Divider: 30px × 1px `#e9e9ec`, 8px vertical margin.
- **Tooltip:** dark `#1f2024`, white 12.5px/550, `padding:6px 10px; border-radius:8px`, with a left caret, appears 12px to the right of the hovered icon, vertically centered; fade `.13s` + small `translateX`.
- Minimal-handle reopen button: 26×46px, white, 1px border (no left border), `border-radius:0 12px 12px 0`, icon `#7e8590`, shadow `2px 0 8px rgba(0,0,0,.05)`.

---

## Interactions & Behavior
- **Collapse / expand triggers:** footer collapse arrows, the topbar toggle, the rail logo, the rail avatar/expand arrows, and (minimal style) the floating handle.
- **Transition:** sidebar container animates `width` over **0.34s `cubic-bezier(.4,0,.2,1)`**. Open and rail contents are stacked as two absolutely-positioned layers and **cross-fade** via `opacity 0.2s` (the outgoing layer keeps its fixed width so nothing reflows/squishes during the slide; the narrowing container clips it). Hidden layer gets `pointer-events:none`.
- **Folder expand:** chevron rotates; children animate via `max-height`.
- **Tooltips:** appear on icon hover only in collapsed state; positioned with `getBoundingClientRect` so they escape the rail's scroll clipping (render in a fixed layer, not inside the scroll container).
- **Reduced motion:** honor `prefers-reduced-motion` — disable the width/opacity transitions.

## State Management
- `collapsed: boolean` — **persist** (prototype uses `localStorage['sb-collapsed']`); restore on load.
- `selectedNav: 'posts' | 'notes'`.
- `folders: { name, count, open, docs[] }[]` — `open` toggles per folder.
- `activeDoc: string | null` — selected document.
- `collapsedStyle: 'nav' | 'recent' | 'handle'` — pick one for production (likely a single choice, not a runtime toggle).
- `tooltip: { label, x, y, visible }` — transient hover state.
- Density (`compact|regular|comfy`) and the accent bar were prototype tweaks — decide if you want them as real settings or just pick the defaults (regular, accent off).

## Design Tokens
```
/* Color */
--accent:      #2f6df6   (brand blue; logo gradient #4b86f8→#2f6df6)
--text:        #1d1d1f   (primary); headings #101114
--muted:       #8b9099   (secondary/icons-muted)
--count:       #6f7e95   (tree counts)
--border:      #e9e9ec
--hover:       #f3f4f6
--selected:    #e8e9ec
--search-bg:   #f1f2f4
--search-focus-border: #cfd6e4
--focus-ring:  rgba(47,109,246,.14)
--tooltip-bg:  #1f2024
--badge-bg:    #eef1f6   --badge-text: #5d6b82
status dots:   draft #e0a020 · published #37b26b

/* Type — system stack: -apple-system, "Segoe UI", system-ui, sans-serif */
wordmark 26/700/-0.02em · nav 16/500 · folder 15/550 · count 13.5/500
doc 14.5/400 · search 15/400 · username 15.5/550 · tooltip 12.5/550

/* Radius */  tile 12 · row 11 · folder 9 · doc 8 · search 12 · rail-btn 12
/* Spacing */ base unit 4px; header pad 18/16/12; row pad 0 12; tree indent 30
/* Shadow */  logo 0 2px 6px rgba(47,109,246,.30); card 0 2px 10px rgba(20,30,50,.05)
/* Motion */  width .34s cubic-bezier(.4,0,.2,1) · opacity .2s · chevron .22s · tooltip .13s
/* Widths */  open 300 (260–340) · nav/recent rail 64 · minimal handle 18
```

## Assets
- **Logo:** `</>` code glyph — replace with your real brand mark in the gradient tile.
- **Icons:** line icons (file, chat bubble, search, chevron, folder, expand/collapse arrows), 24px viewBox, stroke ≈1.7. Use your existing icon library (e.g. Lucide/Heroicons) — exact SVGs are in `icons.jsx` for reference.
- **Avatar:** real user photo, 34px circle. Prototype uses a CSS gradient placeholder.
- No raster images required.

## Files (in this bundle)
- `Sidebar.html` — runnable prototype (loads the JSX below). Open to interact.
- `icons.jsx` — reference SVG line icons.
- `sidebar.jsx` — open-state layout + the 3 collapsed rail directions + data shape.
- `app.jsx` — collapse orchestration, tooltip layer, mock app shell, state.
- `tweaks-panel.jsx` — prototype-only control panel (NOT for production; ignore).

> Implementation note: ignore the Babel/`<script type="text/babel">` setup and the Tweaks panel — those are prototyping scaffolds. Port the markup, tokens, and behavior into your real components.
