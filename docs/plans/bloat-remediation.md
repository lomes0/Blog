# Bloat & layout remediation plan

**Status as of 2026-08-27: steps 1–7 are done.** Step 7's data-model half
shipped the same day the product question was answered — `/posts` builds its
root list with `groupRootItems` and adapts it with `rootItemsToTreeNodes`, the
same two functions the sidebar uses, and `ProjectRow` gives a project a row that
contains its series. **Both drag cases were exercised in a browser on 30 Aug
2026 and both pass** — see the note at the end of this file. Previously: what is
left is not code: **drag reorder across series boundaries and multi-select drag
have not been exercised in a browser**, and
both have broken on this surface before.

Previously: **steps 1–6 are done or effectively done; step 7 is
now UNBLOCKED.** The product question it waited on — does `/posts` render
projects? — was answered **yes** on 27 Aug 2026, so step 7 takes option A of
[tree-model-brief.md](./archive/tree-model-brief.md) §6: the unified `TreeNode`
model in `src/lib/tree/`, plus the project UI `/posts` does not have yet. Steps
1–6 were last re-verified against `main` @ `7f6bce1d` on 2026-07-30. Each step
below carries its own `STATUS` line — read it before acting on the step body,
which describes the state at the time the plan was written.

| Step | Status                                                                      |
| ---- | --------------------------------------------------------------------------- |
| 1    | Done bar the doubtful pair — `knip` now reports **no** unused dependencies  |
| 2    | Done — `PostsCompactListView` and `PostCompactListItem` no longer exist     |
| 3    | Partly done — ~30 unused exported types remain (see `npm run check:unused`) |
| 4    | Done — `hooks/useResizablePanel.ts` + `Layout/ResizeGripper.tsx` landed     |
| 5    | Done — `LoadingState.tsx` gone, `DocumentCard/theme.ts` 149 → 72            |
| 6    | Done — [tree-model-brief.md](./archive/tree-model-brief.md)                 |
| 7    | **Done 27 Aug 2026**; drag verified in a browser 30 Aug 2026                |

Baseline when written: `c366f438`, 71,354 LOC / 451 files. Now 69,777 LOC.

Execution model: **one subagent per step, run sequentially.** Each subagent is
given the observed state and the evidence trail, and must **re-verify it before
acting** — the state descriptions below are findings from a review, not
instructions to be trusted. Every step permits "no change, here's why" as an
outcome.

## Rules that apply to every step

Put these in every subagent prompt:

1. **Re-derive before you delete.** The state description is a claim. Confirm it
   against the code. If it does not hold, stop, change nothing, and report what
   you actually found.
2. **Follow `CLAUDE.md` and `DESIGN.md`.** For any UI work, include "Follow
   DESIGN.md conventions".
3. **Verify:** `source ~/.nvm/nvm.sh && npx tsc --noEmit && npm run lint`. There
   is no test runner in this project — do not claim tests pass. Steps marked
   _needs eyes_ additionally require the user to check the running app; say so
   in your report rather than asserting the UI is fine.
4. **Commit on the current branch** (`main`) — no feature branches. One commit
   per step, so each step is an independent revert point.
5. **Report:** what you verified, what you changed, LOC delta, anything you
   deliberately left and why.

## Sequence

| # | Step                             | Gate                         | Risk              |
| - | -------------------------------- | ---------------------------- | ----------------- |
| 1 | Unused dependencies              | —                            | low               |
| 2 | `PostsCompactListView` dead mode | —                            | low               |
| 3 | Dead type surface                | after 2                      | low               |
| 4 | Panel geometry unification       | —                            | med, _needs eyes_ |
| 5 | Loading/skeleton audit           | —                            | investigation     |
| 6 | Tree-model decision brief        | —                            | no code           |
| 7 | Tree-model unification           | **needs user answer from 6** | high              |

Order rationale: 1–3 are verified and mechanical, and shrink the surface later
steps read. 2 must precede 3 (it orphans more types). 4 is independent of all
post-tree work. 7 is the biggest win but is blocked on a product decision, so it
is last and explicitly gated.

---

## Step 1 — Unused dependencies

> **STATUS: DONE bar the doubtful pair.** `@hello-pangea/dnd` and
> `@fontsource/roboto` are out of `package.json`, and `knip` now reports no
> unused dependencies at all. `workbox-webpack-plugin` / `workbox-window` remain
> — the two the plan said to leave unless `next-pwa`'s peer needs were proven.

**State.** `knip` reports 2 unused deps and 7 unused devDeps. Spot-checks:
`@hello-pangea/dnd` has zero imports anywhere in `src/` or `mcp/` (all drag in
this app is hand-rolled HTML5 via `src/lib/dragDrop.ts`); `@fontsource/roboto`
has zero imports (the loaded families are `public-sans` in
`Layout/ThemeProvider.tsx` and `hanken-grotesk` in
`editor/plugins/ToolbarPlugin/index.tsx`). `next.config.ts:197` reads
`terserOptions` off Next's own plugin instance rather than importing
`terser-webpack-plugin`.

**Decide.** Which of the 9 are genuinely removable. `workbox-webpack-plugin` /
`workbox-window` are the doubtful ones — `knip.json` ignores `next-pwa/**`, so
check whether `next-pwa` needs them as peers before touching them. Leave
anything you cannot prove unused.

**Prove it.** A production build must still succeed: `npm run build`. PWA output
is the thing at risk.

---

## Step 2 — `PostsCompactListView`'s unreachable mode

> **STATUS: DONE.** Neither `PostsCompactListView` nor `PostCompactListItem`
> exists any more. `SeriesSection.tsx` survives.

**State.** Roughly 290 of 560 LOC across two files appear unreachable, via this
chain:

- `posts/PostsView.tsx:299` returns `PostsListView` early when
  `viewType === "compact"`, so `SeriesSection` renders only under grid view.
- That makes `SeriesSection.tsx:33-41` (its `viewType === "compact"` branch)
  unreachable — and it is the only caller that passes `groups` to
  `PostsCompactListView`.
- With `groups` dead, `PostsCompactListView`'s group path is dead:
  `renderSeriesRow` (122-215), `handleDeleteSeries` (79-93), the group render
  block (232-259).
- The only surviving call site is `PostsView.tsx:253`, which passes
  `isTimeEditMode` as a **literal `true`**. So in `PostCompactListItem` (289
  LOC) everything behind `!isTimeEditMode` is dead: `handleNavigate` (60-64),
  the title `Tooltip`/`Typography` branch (165-187), the `PostActionMenu` block
  (270-283), and the `user` prop that only fed it.

**The trap.** Deleting the branch is only right if the early return at
`PostsView.tsx:299` is _intentional_. Evidence says it is —
`PostsView.tsx:301-306` passes `series={seriesList}` and `PostsListView`
interleaves series rows in one shared rank space, so compact `/posts` really
does render series. **Confirm this yourself.** If compact `/posts` does _not_
render series, then that early return is the bug and the branch is the victim —
in that case change nothing and report.

**Decide.** After removal, `PostCompactListItem` is a time-edit-only row of ~135
LOC and `PostsCompactListView` a thin list wrapper. Decide whether they still
earn two files and their current names, or whether they should be renamed to say
what they are, merged, or moved under a time-edit folder. Also decide what
happens to the now-unused `useExpandedState("seriesViewExpandedState")` call and
any orphaned imports (`SeriesGroupItem`, `uuid`, `Collapse`).

---

## Step 3 — Dead type surface

> **STATUS: PARTLY DONE.** The `*Response` cluster is gone, but `knip` still
> lists ~30 unused exported types spread thin across `src/hooks`, `src/lib`,
> `src/indexeddb`, `src/repositories` and `src/store` — one or two per file, so
> this is now a triage pass, not a deletion. Two genuinely dead files remain:
> `Layout/SideBar/hooks/useSidebarDnd.ts` and its
> `__tests__/dragGeometry.test.ts`, both orphaned by step 7's drag-engine
> extraction.

**State.** `knip` lists ~16 unused `*Response` interfaces (9 in `src/types.ts`,
7 in `src/api/types.ts`), 12 files exporting the same symbol both named and
default, and `src/api/client.ts:464-483` re-exporting ~20 types a second time.
Step 2 will likely orphan a few more.

**Decide.** `knip`'s output is **not** a delete list — triage each hit as
_delete_ / _unexport_ (used in-file only) / _keep_ (deliberate API surface, e.g.
a response type that documents an endpoint's contract even if nothing imports it
yet). For the 12 duplicate exports, pick one convention per file and apply it
consistently rather than case by case. For the `api/client.ts` re-export block,
decide whether it is a deliberate barrel — if so keep it and delete the
duplicate at the other end, not both.

Re-run `npm run check:unused` at the end and note the before/after counts.

---

## Step 4 — Panel geometry unification _(needs eyes)_

> **STATUS: DONE.** The seam the step asked for exists:
> `src/hooks/useResizablePanel.ts` and
> `src/components/Layout/ResizeGripper.tsx`, consumed by the copilot panel among
> others. `SidebarWidthContext` is 342 → 301 and `LayoutModeContext` 206 → 145.
> `SidebarResizeHandle.tsx` survives (moved under `Layout/SideBar/`), which is
> consistent with the "do not flatten the detent and spring" instruction.

**State.** The app has three resizable, mode-switching panels and each one's
geometry is implemented independently:

- `contexts/SidebarWidthContext.tsx` (342 LOC):
  `SidebarMode =
  "full"|"compact"|"hidden"`, width, `isResizing`, localStorage
  persistence, drag detent + rAF settle spring.
- `contexts/LayoutModeContext.tsx` (206 LOC):
  `RailMode =
  "full"|"compact"|"hidden"` — _the identical union_ — plus
  `railWidth`/`isRailResizing` **and** `copilotWidth`/`isCopilotResizing`, with
  its own localStorage persistence and its own `DEFAULT/MIN/MAX` triples.
- Redux `ui` slice (`store/app.ts:151,154`): `copilot.open`, `sidebarView`.

So the copilot's _open_ flag lives in Redux while its _width_ lives in a
context; "persist a width, track a resize drag" is written twice; and there are
**three resize grippers in three implementations** — `SidebarResizeHandle.tsx`
(75 LOC, its own component) versus two near-identical inline blocks at
`RightRail/index.tsx:79-88` and `CopilotPanel/CopilotPanel.tsx:104-113` (same
`sx`, same `isResizing ? "primary.main" : "transparent"` trick).

**Decide.** Design the seam. A `useResizablePanel(config)` hook plus one
`<ResizeGripper>` is the obvious shape, but you own the call. Specifically
decide: (a) where copilot `open` belongs — Redux or the context — and move it so
open and width live together; (b) whether the three mode unions become one type
or stay nominally distinct; (c) where the width constants live now that two
files each own a triple.

**Do not flatten the sidebar's detent and spring.** `SideBar/constants.ts`
documents the detent geometry and the spring's damping ratio (ζ = 0.55, ω = 24.5
rad/s) deliberately; it is the one panel with genuinely special feel. It must
come through as _configuration_ of the shared hook, with identical behaviour —
not be simplified away. The heavy comments in that file are load-bearing
documentation, not bloat; carry them to wherever the values land.

**Verification.** Type-check and lint are necessary but not sufficient here.
Report exactly what the user needs to click: drag each of the three panels
through full → compact → hidden and back, confirm the sidebar detent still pops
and settles, confirm widths survive a reload, confirm the copilot open/close
animation still clips gradually (`AppLayoutContent.tsx:66-74`).

---

## Step 5 — Loading/skeleton audit _(investigation first)_

> **STATUS: DONE.** `shared/LoadingState.tsx` (and with it `SuspenseWrapper` /
> `AsyncComponentWrapper`) is gone; `EditorSkeleton` and
> `DocumentBrowserSkeleton` remain, which matches the step's own "these may be
> genuinely different shapes" outcome. `DocumentCard/theme.ts` is 149 → 72.
>
> **Update, 7 Aug 2026:** `shared/EditorSkeleton.tsx` is gone too — not by this
> step's reasoning but as a side effect of deleting `/playground` and
> `/tutorial` (see [upstream-scrub.md](./archive/upstream-scrub.md) phase 5). It was the
> fallback for a Suspense arm only those routes' layout shape could reach, so it
> became unreachable rather than redundant. Three skeleton systems are now two:
> `EditDocument/PaneSkeleton` and `DocumentBrowserSkeleton`, plus
> `DocumentCard/LoadingCard`.

**State.** Four skeleton systems coexist, ~860 LOC: `shared/LoadingState.tsx`
(204, exports `LoadingState` + `SuspenseWrapper` + `AsyncComponentWrapper`),
`shared/EditorSkeleton.tsx` (397), `DocumentCard/components/LoadingCard.tsx`
(259), and `DocumentBrowser/components/DocumentBrowserSkeleton.tsx`. **This
overlap is unverified** — they may be genuinely different shapes (a full editor
chrome skeleton is not a card skeleton is not a spinner).

**Decide.** Establish first whether there is real duplication. "These are four
different things, leaving them alone" is a perfectly good outcome — report it
and stop. Only consolidate what actually repeats.

One concrete thing to check: `DocumentCard/theme.ts` (149 LOC) is a
component-local theme file, which sits oddly next to `src/theme/`. A prior fix
already deleted its `borderRadius` after finding it was the source of a bug (a
bare number in `sx` is ×4, so the card skeleton rendered 40px against
`CardBase`'s 8px). Decide whether the rest of that file belongs in `src/theme/`.

---

## Step 6 — Tree-model decision brief _(no code)_

> **STATUS: DONE** — delivered as
> [tree-model-brief.md](./archive/tree-model-brief.md). The product question it
> raises is still unanswered, which is what blocks step 7.

**State.** The sidebar and `/posts` each render root ⊃ series ⊃ posts from
scratch — ~3,400 LOC:

- sidebar: `ActivePostsSection` 431 + `PostItem` 455 + `SeriesGroup` 265 +
  `ProjectGroup` 223 + `SubTabList` 231 + `CollapsedRail` 147 = **1,752**
- `/posts`: `PostsListView` 600 + `SeriesRow` 385 + `PostRow` 275 +
  `PostRowContextMenu` 228 + `BulkActionBar` 199 = **1,687**

Shared primitives are already extracted (`hooks/useRowSelection.ts`,
`lib/dragDrop.ts`, `theme/treeRow.ts`). What remains split is the **data
model**: `utils/posts/seriesGrouping.ts:36` `RootItem` is a nested 3-level tree
(project ⊃ series ⊃ posts, sidebar-only), while `PostsListView.tsx:44` is a flat
2-level list. `/posts` is a strict subset — no projects, and series are not
draggable there (`SeriesRow` has no `draggable`; reorder is ⋯-menu-only).

**Deliverable: a written brief, no code changes.** Answer:

1. What would have to become true for one tree model to serve both surfaces?
2. The product question that blocks it: **does `/posts` render projects?** Lay
   out both answers — if yes, what the unified model looks like and what
   `/posts` gains; if no, whether a shared model still pays for itself when one
   consumer ignores a level.
3. Also settle whether series should become draggable on `/posts`, since a
   unified model makes that nearly free and its absence today may be incidental
   rather than intended.
4. Estimated LOC delta and the riskiest files for each option.
5. A recommendation.

The user answers before step 7 runs.

---

## Step 7 — Tree-model unification _(unblocked 27 Aug 2026)_

> **STATUS: DONE 27 Aug 2026.** The data model is one: `PostsListView` no longer
> declares its own union, and `PostsListView.tsx`, `ActivePostsSection.tsx`,
> `SeriesGroup.tsx` and `ProjectGroup.tsx` all render the same `RootItem`. New
> on `/posts`: `ProjectRow` (a container row with the pill outline, deliberately
> not the sidebar's band), a project arm in the row menu, project rows in bulk
> selection and delete, a "New project" item in the split button, and
> `rendersProjects` following the prop rather than being hard-coded off. Guests
> and series mode get the flat list, because `capabilities().projects` is
> signed-in only and a project row nobody can act on is chrome pretending to be
> a feature. What follows is the state before that.
>
> **Was: OPEN, and partly pre-empted.** The _drag engine_ was unified ahead
> of the decision — `src/lib/tree/model.ts` (152) + `src/lib/tree/useTreeDnd.ts`
> (434), landed in `6f0317c7` / `dc61c6c0` and consumed by both surfaces
> (`PostsListView`, `ActivePostsSection`, `SeriesGroup`, `ProjectGroup`,
> `seriesGrouping`). What remains open is exactly the _data model_:
> `PostsListView.tsx:52-64` still declares its own flat
> `PostRootItem | SeriesRootItem` union alongside `seriesGrouping.ts`'s nested
> tree. So the brief's question still gates the same work, on a smaller diff
> than originally scoped. Clean up `useSidebarDnd.ts` (step 3) as part of it.

Do not launch until step 6's brief is answered. Fill this prompt in from the
chosen option. Expect this to be the largest diff of the plan; it should be
split into its own sequence of commits (model first, then each consumer moved
over), and it _needs eyes_ on both `/posts` and the sidebar — including drag
reorder across series boundaries and multi-select drag, which has broken here
before.

---

## Browser verification, 30 Aug 2026

Both drag cases this file called unexercised were driven in headless Chrome
against the sidebar, signed in as the real author over a session row, with
`docs/plans/archive/ordering-simplification.md` phases 1–3 in the tree — so the run
doubles as the check that reads-from-arrays and writes-through-`rank` agree
under a real gesture.

The surface is the **sidebar**, not the `/posts` grid: the grid's post chips are
not `draggable`, and all 101 draggable nodes on the page are sidebar rows.

Four gestures, each verified in the database rather than on screen:

1. **Root reorder** — a note dragged to the head of the list. `rank` moved
   `at`→`aJ`, `User.rootOrder` followed, and the two still agreed.
2. **Within-series reorder** — the last post of `Linux` dragged to its head.
   `Series.postOrder` followed.
3. **Cross-series drag** — a post dragged from `Linux` into `Performance`. Both
   arrays were corrected: the id was appended to the destination at the drop
   slot *and removed from the source*, leaving no orphan. This is the case that
   had broken here before.
4. **Multi-select drag** — two rows ctrl-clicked and dragged together. The
   payload carried both ids, both moves fired, and relative order was kept.

After all four: `rootOrder`, `postOrder`, `tabOrder` and `seriesOrder` each
still equalled their container's `rank` order exactly, zero orphaned ids, row
counts unchanged. The author's data was then restored to its original ranks from
the pre-work dump and the arrays resynced, so the run left nothing behind.

One trap worth keeping. Selection is `useRowSelection(ids, "clear")` on the
sidebar, and under `"clear"` a *plain* click sets only the anchor — it does not
select. Multi-select needs the modifier on **every** click, including the first;
a plain click followed by a ctrl-click selects one row, and the drag then
carries that row alone while looking like it should carry two.
