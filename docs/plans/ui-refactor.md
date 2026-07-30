# UI Refactor Plan — blog_editor_v2

Reference mockup: `blog_editor_v2.html`\
Design labels: **A** Tidy · **B** TOC Rail · **C** Focus · **D** Doc Info → Rail
· **T** Sub-doc Tabs

---

## Dependency graph

```
Phase 1 — Three-column layout (shell)
  ├── Phase 2 — Right rail content        (needs column to exist)
  └── Phase 3 — Sidebar collapse (icons)
        └── Phase 4 — Sub-doc tree in sidebar  (needs compact state)
Phase 5 — Title block + toolbar           (independent)
Phase 6 — Focus mode                      (after Phase 1 + 2 stable)
Phase 7 — Tab context menu                (independent)
```

Safe to start in parallel with Phase 1: **Phases 3, 5, 7**.

---

## Phase 1 — Three-column layout

> Foundation for everything. Every page is affected; do this on a branch.

### Goal

Replace the current two-column flex shell (sidebar + main) with a three-column
CSS grid (sidebar | main | right rail). The right rail column is new; all three
columns are independently collapsible via CSS variables.

### Steps

- [x] **1.1** Grid column widths computed from `SidebarWidthContext`
      (`getEffectiveWidth`) and `LayoutModeContext` (`railMode`). Values:
      sidebar default `130px`, rail full `280px`, compact `54px`, hidden `0px`.
      Transition disabled during sidebar resize.

- [x] **1.2** Rewrote `src/components/Layout/AppLayoutContent.tsx`:
  - Outer `Box` is now `display: grid`.
  - `gridTemplateColumns: "${sidebarW}px 1fr ${railW}px"` (computed from
    contexts).
  - `<SideBar />` in column 1, `<main>` in column 2, `<RightRail />` in
    column 3.
  - Removed `CONTENT_RIGHT_PADDING` (was only needed for the old drawer arrow).

- [x] **1.3** Created `src/components/Layout/RightRail/index.tsx` — empty shell
      that accepts `railMode: RailMode` prop. Renders `null` when `hidden`;
      sticky 54px strip when `compact`; sticky 280px panel when `full`.

- [x] **1.4** Created `src/contexts/LayoutModeContext.tsx` with
      `railMode: RailMode` (`"full" | "compact" | "hidden"`) + `toggleRail()`.
      State persisted to `localStorage` key `ui.railMode`. Stubbed for Phase 5/6
      additions. Also lifted `sidebarOpen` / `toggleSidebar` / `isMobile` into
      `SidebarWidthContext` (replaces `useSidebarState` hook usage in `SideBar`
      and `ViewContainerWrapper`).

- [x] **1.5** Added `⊟` rail-toggle `IconButton` (mirrored `ViewSidebar` icon)
      to the right end of `Breadcrumbs.tsx`. Calls `toggleRail()` from
      `useLayoutMode`. Tooltip cycles: "Collapse rail to icons" → "Hide rail" →
      "Show rail".

- [x] **1.6** Removed `DocumentInfoDrawerArrow` from `AppLayout.tsx`. File
      `DocumentInfoDrawerArrow.tsx` kept on disk — delete after Phase 2 lands.

### Files touched

- `src/components/Layout/AppLayoutContent.tsx` — rewrite
- `src/components/Layout/AppLayout.tsx` — remove `DocumentInfoDrawerArrow`
- `src/components/Layout/DocumentInfoDrawerArrow.tsx` — delete after Phase 2 is
  done
- `src/contexts/LayoutModeContext.tsx` — new
- `src/components/Layout/RightRail/index.tsx` — new

---

## Phase 2 — Permanent right rail content

> Migrates Doc Info out of the slide-out drawer into the permanent rail.

### Goal

Build four collapsible `<RailSection>` cards inside the right rail: **Outline**,
**Properties**, **Revisions**, **Backlinks**. These replace `EditDocumentInfo` /
`ViewDocumentInfo` drawers. When the rail is in compact (icon) mode, show only
icon buttons for each section.

### Steps

- [x] **2.1** Created `src/components/Layout/RightRail/RailSection.tsx` —
      collapsible card with `icon + title + count chip + chevron` header.
      `Collapse` body. `role="region"` + `aria-label` for accessibility.

- [x] **2.2 — Outline section** (`RightRail/OutlineSection.tsx`):
  - Reads serialized editor state from Redux (`local.data`) for the active doc —
    no Lexical plugin required; headings extracted by
    `src/utils/editorContent.ts` (`extractHeadings`).
  - H2 flush, H3 indented; clicking scrolls `#app-main` container to the
    heading.
  - `LinearProgress` scroll bar + "~N min left" caption at 200 wpm.
  - Compact mode handled in `RightRail/index.tsx` (icon strip → `toggleRail()`
    to expand).

- [x] **2.3 — Properties section** (`RightRail/PropertiesSection.tsx`):
  - Two-column key/value grid: Status chip, Author (linked), Series + position,
    Slug (mono), Created date.
  - Tab sub-group (dashed `info.main` divider): Title, Updated, Word count, Save
    state dot.
  - Tab sub-group only shown in edit mode when `tabIds.length > 1`.

- [x] **2.4 — Revisions section** (`RightRail/RevisionsSection.tsx`):
  - Compact display-only rows (avatar + author + date + cloud/local badge).
  - "This tab / All tabs" chip toggle; "This tab" filters to `activeDocId`
    revisions.
  - "show N more ▾" collapse after 3 rows.

- [x] **2.5 — Backlinks section** (`RightRail/BacklinksSection.tsx`):
  - `GET /api/documents/[id]/backlinks` added — raw SQL `LIKE %id%` over
    `Revision.data::text`.
  - Link rows with doc icon. Collapsed by default.

- [x] **2.6** `EditDocumentInfo.tsx` gutted: removed `AppDrawer` + revision
      grid + meta section. Renders a compact action-button bar (Preview,
      Compare, Share, Fork, Download, Edit) + `AttachmentDrawer`. Will be
      deleted after Phase 5 moves buttons to topbar.

- [x] **2.7** `ViewDocumentInfo.tsx` gutted: removed `AppDrawer` + revision
      grid + author block. Renders action-button bar (Share, Fork, Download,
      Edit link) + `AttachmentDrawer`.

  **Implementation notes:**
  - `RightRail/index.tsx` derives `rootId` + `mode` from `usePathname()`; reads
    `state.ui.tabs.activeTabId` from Redux for active tab in edit mode.
  - `AppLayoutContent` has `id="app-main"` on the `<main>` Box for scroll
    tracking.
  - `src/utils/editorContent.ts` is a new shared utility (`extractHeadings`,
    `countWords`).
  - `DocumentMetaSection.tsx` still exists but is no longer imported — delete
    after confirming no other uses.
  - `DocumentInfoDrawerArrow.tsx` still exists — delete now (no trigger left
    after Phase 1).

### Files touched

- `src/components/Layout/RightRail/RailSection.tsx` — new
- `src/components/Layout/RightRail/OutlineSection.tsx` — new
- `src/components/Layout/RightRail/PropertiesSection.tsx` — new (replaces
  `DocumentMetaSection`)
- `src/components/Layout/RightRail/RevisionsSection.tsx` — new
- `src/components/Layout/RightRail/BacklinksSection.tsx` — new
- `src/app/api/documents/[id]/backlinks/route.ts` — new
- `src/components/EditDocument/EditDocumentInfo.tsx` — gutted / deleted
- `src/components/views/ViewDocumentInfo.tsx` — gutted / deleted
- `src/components/EditDocument/DocumentMetaSection.tsx` — content moved, delete
  after

---

## Phase 3 — Sidebar collapse to icon strip

> Adds the intermediate "icon strip" state (62px) to the left sidebar.

### Goal

The sidebar currently resizes fluidly and closes fully. Add a discrete `compact`
state that shows only icon buttons (Posts, Notes, Search, New, User avatar). The
`‹` chevron toggles full ↔ compact; the `≡` hamburger in the topbar does the
same.

### Steps

- [x] **3.1** Add `compact` mode to `useSidebarState` hook
      (`SideBar/hooks/useSidebarState.ts`). State machine:
      `full | compact | hidden`. `hidden` is the existing mobile close behavior.
      `compact` is new for desktop.

- [x] **3.2** Update `SidebarWidthContext` — added `COMPACT_WIDTH = 62` and
      `SIDEBAR_MODE_KEY = "ui.sidebarMode"` to `SideBar/constants.ts`. Rewrote
      `SidebarWidthContext` with `SidebarMode = "full" | "compact" | "hidden"`,
      new fields `sidebarMode`, `setSidebarMode`, `toggleSidebarCompact`
      (full↔compact, desktop), `toggleSidebar` (hidden↔full, mobile).
      `getEffectiveWidth()` takes no args and returns 0 / 62 / userWidth based
      on mode. Mode persisted to `localStorage["ui.sidebarMode"]`.

- [x] **3.3** Updated `src/components/Layout/SideBar/index.tsx`:
  - Imports `sidebarMode` + `toggleSidebarCompact` from `useSidebarWidth()`.
  - Derives `isExpanded = sidebarMode === "full"` for text-label visibility.
  - All text labels, `ListItemText`, font-size controls, user name, and resize
    handle conditioned on `isExpanded` (not `sidebarOpen`).
  - `getEffectiveWidth()` calls updated to no-arg form.
  - `SidebarHeader` receives `isExpanded` (as `open`) and
    `toggleSidebarCompact`.
  - `ActivePostsSection` receives `isExpanded` as `sidebarOpen`.

- [x] **3.4** Updated `src/components/Layout/SideBar/SidebarHeader.tsx` —
      renamed `toggleSidebar` prop to `toggleSidebarCompact`; chevron `onClick`
      now calls `toggleSidebarCompact()` to cycle full ↔ compact (not full
      close).

- [x] **3.5** Added hamburger `≡` (`Menu` icon) to the left of
      `Breadcrumbs.tsx`. Calls `toggleSidebarCompact()` from
      `useSidebarWidth()`. Tooltip reflects current mode.

- [x] **3.6** Updated `AppLayoutContent.tsx` — `getEffectiveWidth(sidebarOpen)`
      → `getEffectiveWidth()`.

  **Implementation notes:**
  - `sidebarOpen` (= `sidebarMode !== "hidden"`) is kept as the MUI
    `Drawer open` prop and the mobile `onClose` target.
  - `isExpanded` (= `sidebarMode === "full"`) gates all text/label rendering,
    producing the icon-strip behavior when compact without a separate rendering
    branch.
  - Keyboard shortcuts (`useKeyboardShortcuts`) still bind to `toggleSidebar`
    (full open/close) so pressing the shortcut on mobile works as expected.

### Files touched

- `src/components/Layout/SideBar/constants.ts` — add `COMPACT_WIDTH`,
  `SIDEBAR_MODE_KEY`
- `src/contexts/SidebarWidthContext.tsx` — full rewrite with `SidebarMode` state
  machine
- `src/components/Layout/SideBar/index.tsx` — `isExpanded` logic, no-arg
  `getEffectiveWidth`
- `src/components/Layout/SideBar/SidebarHeader.tsx` — chevron wired to
  `toggleSidebarCompact`
- `src/components/Layout/Breadcrumbs.tsx` — hamburger `≡` button added
- `src/components/Layout/AppLayoutContent.tsx` — `getEffectiveWidth()` no-arg
  call

---

## Phase 4 — Sub-doc tabs in the sidebar tree

> Posts with multiple tabs show a count badge and an expandable sub-tab list.

### Goal

In the sidebar, each post that has child documents (tabs) shows a teal `N`
badge. When that post is the active route, the badge expands into an indented
list of tab names with a dashed-teal left border. Clicking a tab name dispatches
`setActiveTab`.

### Steps

- [x] **4.1** Extended `PostItem.tsx` — `PostItem` selects `state.ui.tabs`
      directly via `useSelector` (avoids prop-drilling through `SeriesGroup`).
      Derives `tabCount` and `subTabs` per post using
      `documentsSelectors.selectById`. Shows a small teal rounded badge with the
      count when `tabCount > 1` and sidebar is expanded.

- [x] **4.2** Created `src/components/Layout/SideBar/SubTabList.tsx`:
  - `<ul>` with `borderLeft: "1.5px dashed info.main"` and `paddingLeft: 22px`.
  - Each `<li>` has a small teal square dot, tab name, and a dirty dot if
    `dirty`.
  - Active tab row highlighted with `info.main` bg + bold text.
  - Clicking calls `dispatch(actions.setActiveTab(id))`.

- [x] **4.3** No changes to `ActivePostsSection.tsx` needed — tab data is
      derived inside `PostItem` via `useSelector` on `state.ui.tabs` +
      `documentsSelectors`.

- [x] **4.4** `<SubTabList>` renders inside `PostItem` (below the
      `ListItemButton`) when `sidebarOpen && isSelected && subTabs.length > 1`.

### Files touched

- `src/components/Layout/SideBar/PostItem.tsx` — add badge + SubTabList
- `src/components/Layout/SideBar/SubTabList.tsx` — new
- `src/components/Layout/SideBar/ActivePostsSection.tsx` — derive tab props

---

## Phase 5 — Title block + topbar toolbar redesign

> Labels A and D. Independent of Phases 1–4; can land first.

### Goal

Replace the current breadcrumb + implicit editor title with a structured header:
eyebrow line → H1 with inline save state → chip meta-row. Redesign the topbar
toolbar to be grouped, with Edit as the primary CTA.

### Steps

- [x] **5.1** Create `src/components/EditDocument/DocumentHeader.tsx`:
  - **Eyebrow** (`Typography variant="caption"`, mono):
    `▤ Tab N of M · {tabName} · slug {slug} · {seriesName} {pos}/{total}` plus
    `⤓ Local` and `☁ Synced` MUI Chips.
  - **Title** (`Typography variant="h4"` or custom): document/tab name,
    right-aligned inline `SaveStateIndicator` — a colored dot + "Saved Xs ago" /
    "Unsaved changes".
  - **Meta-row**: status chip (color-coded by `DocumentStatus`), tag chips,
    right-aligned date + word count string.
  - **Divider** below.
  - This component lives above `<ConnectedEditor>` inside
    `EditDocumentContent.tsx`.

- [x] **5.2** Create `src/components/Layout/EditorTopBar.tsx`:
  - Left cluster: hamburger `≡` (calls `toggleSidebarCompact`), breadcrumb path
    (`Posts › Series › Post › Tab`).
  - Right cluster:
    - `[Outline ⌘]` — calls `toggleRail()` from `useLayoutMode`
    - `[Aa]` — opens font-size popover (reuse sidebar font-size controls)
    - `[☼]` — toggles theme (calls MUI color-scheme toggle)
    - divider
    - `[↗ Share]` — opens `ShareDocument` dialog
    - `[⧉]` copy link icon button
    - `[⋯]` more menu (download, fork, etc.)
    - `[✎ Edit]` primary button — navigates to `/edit/:id` or switches to edit
      mode
    - `[⊟]` rail toggle icon button
  - Replace the current `Breadcrumbs.tsx` usage in `AppLayoutContent.tsx` with
    this bar.

- [x] **5.3** Update `src/components/Layout/Breadcrumbs.tsx` — extend the
      active-tab crumb: when `state.ui.tabs.activeTabId !== rootId`, append
      `› {tabName}` to the breadcrumb path. (Or retire this file once
      `EditorTopBar` is in place.)

- [x] **5.4** Create `src/components/EditDocument/SaveStateIndicator.tsx`:
  - Reads save state from Redux (`isDirty`, last-saved timestamp).
  - Renders a dot (green = saved, amber = saving, red = unsaved) + relative time
    string.
  - Used both in `DocumentHeader` (inline next to title) and as the dirty dot in
    `SubTabList` (Phase 4).

- [x] **5.5** Simplify `SaveDiscardActions.tsx` — the full-width Save/Discard
      button footer can be reduced to just the Save button, since save state is
      now visible via `SaveStateIndicator`. Or remove the footer entirely and
      rely on `Cmd+S` + the topbar.

### Files touched

- `src/components/EditDocument/DocumentHeader.tsx` — new
- `src/components/EditDocument/SaveStateIndicator.tsx` — new
- `src/components/Layout/EditorTopBar.tsx` — new (replaces `Breadcrumbs`)
- `src/components/Layout/Breadcrumbs.tsx` — extend or retire
- `src/components/EditDocument/EditDocumentContent.tsx` — insert
  `DocumentHeader`
- `src/components/EditDocument/SaveDiscardActions.tsx` — simplify

---

## Phase 6 — Focus mode

> Depends on Phase 1 (layout grid) and Phase 2 (rail) being stable.

### Goal

A tri-state editor mode (`read | focus | edit`) stored in `LayoutModeContext`.
In `focus` mode: both rails collapse, content centers at max-width 720px, a
floating outline pill appears at top-right, and a sticky topbar stays visible.

### Steps

- [x] **6.1** Extend `src/contexts/LayoutModeContext.tsx` (from Phase 1.4):
  - Add `viewMode: "read" | "focus" | "edit"`.
  - `setFocus()` → collapses sidebar to compact + hides right rail.
  - `setRead()` → restores both rails to previous open state.

- [x] **6.2** In `AppLayoutContent.tsx`, when `viewMode === "focus"`:
  - Set sidebar column to `COMPACT_WIDTH` (62px) and rail column to 0px.
  - Set `main` container `maxWidth: 720px` with `mx: "auto"`.
  - Pass `railMode="hidden"` to RightRail when focus.
  - SideBar `isExpanded` also gates on `viewMode !== "focus"`.

- [x] **6.3** Created `src/components/Layout/FloatingOutlinePill.tsx`:
  - `position: "fixed"`, `right: 24`, `top: 70`, `zIndex: 3`, `width: 170`.
  - Renders TOC list derived from Redux (same source as OutlineSection).
  - Visible only when `viewMode === "focus"` and document has headings.

- [x] **6.4** Made the topbar sticky in focus mode:
  - `EditorTopBar` gets `position: "sticky"`, `top: 0`,
    `backdropFilter: "blur(8px)"`, `zIndex: "appBar"` when
    `viewMode === "focus"`.

- [x] **6.5** Wired the `F` keyboard shortcut and `CenterFocusWeak` icon button
      in `EditorTopBar` to `setFocus()` / `setRead()`. Button highlights in
      `primary.main` when focus is active.

### Files touched

- `src/contexts/LayoutModeContext.tsx` — extend (Phase 1 file)
- `src/components/Layout/AppLayoutContent.tsx` — focus-mode grid overrides
- `src/components/Layout/FloatingOutlinePill.tsx` — new
- `src/components/Layout/EditorTopBar.tsx` — sticky style + focus button

---

## Phase 7 — Tab context menu

> Independent. Lowest risk; can land any time after EditorTabBar exists.

### Goal

Right-clicking a tab (or clicking `⋯` in the tab overflow) opens a context menu
with the full action set from the mockup.

### Steps

- [ ] **7.1** Create `src/components/EditDocument/TabContextMenu.tsx`:
  - MUI `<Menu>` anchored to the tab element.
  - Items: **Rename** (F2), **Duplicate** (⌘D), **Move to other post…**, **Split
    off as new post**, divider, **Pin tab**, **Reorder…**, divider, **Delete
    tab** (⌘⌫, `color="error"`).

- [ ] **7.2** Implement each action in `TabbedDocumentEditor.tsx`:
  - **Rename**: already exists via double-click — wire same `handleRename` to
    menu item.
  - **Duplicate**: call `apiClient.documents.create` with copied content + new
    `id`.
  - **Move to other post**: open a post-picker dialog; call
    `apiClient.documents.update(tabId, { parentId: targetPostId })`.
  - **Split off**: call `apiClient.documents.update(tabId, { parentId: null })`
    — tab becomes a standalone post.
  - **Delete**: already exists via close-confirm dialog — reuse
    `handleCloseRequest`.

- [ ] **7.3** Update `EditorTabBar.tsx`:
  - Add `onContextMenu` handler to each tab item → call
    `openContextMenu(tabId, event)`.
  - Add `⋯` overflow button in the tab strip (already partially rendered) that
    also calls `openContextMenu`.
  - Pass `onDuplicate`, `onMove`, `onSplitOff` callbacks down from
    `TabbedDocumentEditor`.

### Files touched

- `src/components/EditDocument/TabContextMenu.tsx` — new
- `src/components/EditDocument/TabbedDocumentEditor.tsx` — add action handlers
- `src/components/EditDocument/EditorTabBar.tsx` — wire context menu trigger

---

## Cross-cutting concerns

### Design system

All new components must follow `DESIGN.md`:

- MUI v6 only — no Radix/Tailwind/shadcn.
- Use `--mui-palette-*` tokens; never hard-code hex values.
- Tab accent color maps to `info.main` (`#3b82f6`); the mockup's teal `--T`
  value.
- Series/secondary color maps to `secondary.main` (`#9333ea`).

### Accessibility

- All icon-only buttons need `aria-label`.
- Rail sections need `role="region"` + `aria-label`.
- Tab strip items need `role="tab"` + `aria-selected`.
- Floating outline pill needs `role="navigation"` +
  `aria-label="Document outline"`.

### State persistence

- Rail open/compact state and sidebar compact state should be persisted to
  `localStorage` (key: `ui.railMode`, `ui.sidebarMode`) so the layout survives
  page reloads.
- `viewMode` (read/focus/edit) should NOT be persisted — reset to `read` on
  navigation.

---

## Completion checklist

| Phase | Description                                       | Status |
| ----- | ------------------------------------------------- | ------ |
| 1     | Three-column layout shell                         | ✓      |
| 2     | Right rail content (Outline/Props/Revs/Backlinks) | ✓      |
| 3     | Sidebar collapse to icon strip                    | ✓      |
| 4     | Sub-doc tabs in sidebar tree                      | ✓      |
| 5     | Title block + topbar toolbar                      | ✓      |
| 6     | Focus mode                                        | ✓      |
| 7     | Tab context menu                                  | ☐      |
