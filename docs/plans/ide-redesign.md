# IDE Redesign — Phased Plan (visible pass)

Applying the **Blog IDE** proposal
(`claude_design/ide/IDE UIUX redesign proposal.zip`) to this app.

## Locked decisions

- **Strategy:** converge the existing shell in place — no new `/workspace`
  route, no rewrite. The app already implements ~70% of the proposal's skeleton.
- **Aesthetic:** adopt the IDE _structure & cues_ (mono filenames, `.md` naming,
  caret folders, accent bars, denser chrome) but keep our **DESIGN.md tokens**
  (indigo/slate, Public Sans). No new palette. This is what the proposal itself
  asks for ("map to your own system").
- **Read/Edit:** keep separate `/edit/:id` and `/view/:id` routes; the segmented
  switch just navigates between them. No routing refactor.
- **Regions in scope this pass:** (1) title-bar search entry, (2) Explorer
  file-tree restyle, (3) far-left activity rail + sidebar views. Plus the small
  Read/Edit toggle (EditorTopBar already detects mode).
- **Done already (Phase 0):** ⌘K command palette
  (`src/components/CommandPalette/CommandPalette.tsx`, mounted in
  `AppLayoutContent`). Opens on ⌘K/Ctrl+K or the `openCommandPalette()` event.

## Current shell vs. target

**Current** (`AppLayoutContent.tsx` grid):

```
┌───────────────────────────────────────────────┐
│ [Sidebar] [ Main: EditorTopBar + content ] [Copilot] [RightRail] │
└───────────────────────────────────────────────┘
```

- No full-width title bar; `EditorTopBar` is per-main-column and already renders
  breadcrumbs + tabs (`TopBarTabsContext`) + a sidebar-compact toggle.
- "Rail" here = the **left sidebar's** width mode (`full` 280px / `compact`
  54px). `RightRail` = the **right** inspector (Outline/Backlinks/Properties…).
- There is **no** far-left activity-rail column that switches sidebar views.

**Target** (proposal):

```
┌─ TITLE BAR (logo · menus · ⌘K search · theme/AI) ─┐
├──────┬─────────┬──────────────────┬───────────────┤
│ ACT- │ SIDEBAR │   EDITOR COLUMN  │   AI PANEL    │
│ RAIL │ (view:  │  (tabs/breadcrumb│  (Copilot)    │
│ 54px │ Explorer│   /mode/toolbar) │               │
│      │ /Search │                  │               │
│      │ /Notes) │                  │               │
├──────┴─────────┴──────────────────┴───────────────┤
│ STATUS BAR (save · mode · words · AI ready)        │
└────────────────────────────────────────────────────┘
```

## Gap analysis

| Proposal region        | Status in app                           | Work                    |
| ---------------------- | --------------------------------------- | ----------------------- |
| ⌘K command palette     | ✅ shipped (Phase 0)                    | done                    |
| Title-bar search entry | ❌ none                                 | **Phase 1**             |
| Explorer file tree     | ⚠️ exists (`SeriesGroup`), not IDE look | **Phase 2** (restyle)   |
| Activity rail + views  | ❌ none (only sidebar width mode)       | **Phase 3** (new)       |
| Read/Edit switch       | ⚠️ mode detected, no control            | **Phase 1** (small add) |
| Tabs + breadcrumb      | ✅ in `EditorTopBar`                    | polish only (later)     |
| AI panel               | ✅ `CopilotPanel`                       | restyle later           |
| Status bar             | ❌ none                                 | later                   |

---

## Phase 1 — Title-bar search entry + Read/Edit toggle + ⌘K conflict

**Goal:** the first thing that makes the redesign _visible_, plus a mouse path
into the palette.

**Placement decision (see Open Decisions #1):** recommended — add the centered
search pill into the existing `EditorTopBar`, not a new full-width title bar.
Smaller blast radius, still visible on every editor/view page.

**Work:**

- Add a centered, max-~520px button in `EditorTopBar`: "Search posts or run a
  command…" + `⌘K` chip. `onClick → openCommandPalette()`. Style with
  `background.input`, 8px radius, `text.secondary`.
- Add the Read/Edit segmented control (right side of the breadcrumb row) — MUI
  `ToggleButtonGroup`, Eye/Pencil icons. Active = accent-filled.
  `onChange →
  router.push('/edit|view/:id')`. Only shown on doc pages (mode
  already detected at `EditorTopBar.tsx:93`).
- **Resolve the ⌘K conflict:** the Lexical editor binds ⌘K to _insert link_
  (`TextFormatToggles.tsx:166`). Scope the palette shortcut to fire only when
  focus is **outside** the editor (mirror how ⌘B is gated), so inside the editor
  ⌘K stays "insert link". The title-bar pill remains the always-available entry.

**Files:** `EditorTopBar.tsx`, `CommandPalette.tsx` (shortcut gating).
**State:** none. **Acceptance:** pill visible on posts/edit/view; click opens
palette; ⌘K opens palette everywhere except inside the editor; Read/Edit toggle
navigates.

---

## Phase 2 — Explorer file-tree restyle

**Goal:** make the existing series-as-folders sidebar _look_ like an IDE file
tree, using our tokens.

**Work (styling pass on existing components — no data/logic change):**

- `SeriesGroup.tsx`: folder row = rotating caret (▸/▾) + folder icon + name;
  children indent with a guide.
- `PostItem.tsx`: file icon + **monospace** `name.md` (truncate w/ ellipsis) +
  trailing **dirty dot** when unsaved; active row = `background.input` tint +
  inset accent bar on the left edge.
- Standalone posts render at top level (no folder), matching the proposal.
- Keep all existing behavior: context menus, drag-reorder (rank order),
  navigation, rename. This is CSS/markup only.

**Files:** `SeriesGroup.tsx`, `PostItem.tsx`, `ActivePostsSection.tsx`, possibly
`SidebarHeader.tsx` (EXPLORER label + add/collapse icons). **State:** none.
**Acceptance:** tree reads as `.md` files under caret folders; dirty dots +
active accent bar present; reduced-motion respected; no behavior regressions.

---

## Phase 3 — Far-left activity rail + sidebar views (the new structural piece)

**Goal:** a 54px icon column that switches which view the sidebar renders.

**Work:**

- Add `ui.sidebarView: 'explorer' | 'search' | 'notes'` to the app slice
  (`store/app.ts` initialState + a `setSidebarView` reducer). Default
  `'explorer'`.
- New `ActivityRail` component as the **first grid column** in
  `AppLayoutContent` (54px). Top: Explorer / Search / Notes / AI icon buttons
  (active = accent bar on left edge + tinted bg). Bottom: command palette (→
  `openCommandPalette()`), settings, user avatar. AI button →
  `setCopilotOpen(!open)` (it toggles the panel, not a sidebar view).
- Refactor `SideBar/index.tsx` to render by `sidebarView`:
  - **Explorer:** current tree (post Phase 2).
  - **Search:** new view — text input + result count + flat list of posts
    filtered by title, each showing mono `folder/name.md`. Reuse
    `selectAllPosts`. Clicking opens `/edit/:id`.
  - **Notes:** either embed the existing notes surface or link to `/notes` (see
    Open Decisions #3).
- Reconcile with existing `SidebarNav` (Posts/Notes): the activity rail replaces
  its role; remove `SidebarNav` from the expanded layer or repoint it.

**Files:** new `ActivityRail/`, new `SidebarSearchView`, `AppLayoutContent.tsx`
(grid column), `SideBar/index.tsx`, `store/app.ts`, `store/index.ts`. **State:**
`ui.sidebarView` (+ optional `searchQuery`). **Acceptance:** rail switches
Explorer/Search/Notes; active item shows accent bar; AI button toggles Copilot;
Search filters posts and opens them; keyboard accessible (aria-labels on icon
buttons).

---

## Deferred (next pass, not this one)

- **Status bar** (bottom, full-width): save state · mode · word count ·
  read-time · "AI ready". Compute word count from the active doc.
- **AI panel restyle**: Copilot → suggested-action cards + IDE chat styling.
- **Tabs/breadcrumb polish**, front-matter card in the doc body, formatting
  toolbar grouping to match the proposal's button set.

## Cross-cutting: state & architecture

- New Redux: `ui.sidebarView` (Phase 3). Everything else is presentational or
  local/context state.
- No routing changes (Read/Edit stays two routes).
- No new dependencies (MUI v6 + lucide only, per DESIGN.md).

## Open decisions (recommendations in **bold**)

1. **Title bar placement:** _in the existing `EditorTopBar`_ (**recommended**,
   low risk) vs. a new full-width title-bar row above the whole grid (closer to
   proposal, larger structural change). Can promote later.
2. **Activity rail vs. sidebar-compact mode:** the current 54px _compact
   sidebar_ and the new 54px _activity rail_ both want the far-left ~54px.
   **Recommended:** activity rail becomes the permanent far-left column; sidebar
   collapse hides the wider sidebar _next to_ it (rail always visible), matching
   the proposal.
3. **Notes view:** embed notes in the sidebar vs. keep `/notes` route and have
   the rail's Notes button navigate there. **Recommended:** navigate to `/notes`
   first (cheap), embed later if desired.
4. **Search shortcut gating:** gate ⌘K to outside-editor (**recommended**) vs.
   let palette `stopPropagation` and win everywhere (would break editor's
   insert-link). Go with gating.

## Risks

- Activity-rail refactor touches the shared shell (`AppLayoutContent`,
  `SideBar`) — most regression-prone phase; land it last and behind the other
  two visible wins.
- Explorer restyle must preserve drag-reorder (rank ordering) and context menus
  — verify no regressions.
- `useColorScheme`/theme already wired; no theme changes needed.

## Suggested order

Phase 1 (fast visible win) → Phase 2 (visible, low risk) → Phase 3 (structural,
highest risk). Land each independently so progress is visible and reversible.
