# Step 6 — Tree-model decision brief

**Status: §0 answered 27 Aug 2026 — YES, `/posts` renders projects.** Step 7 of
[bloat-remediation.md](./bloat-remediation.md) is unblocked, and the shape to
build is **option A** in §6/§7: the unified `TreeNode` model in `src/lib/tree/`,
net ≈ −135 LOC after the ~200 LOC of new project UI §6 enumerates. Everything
below is the brief as written; nothing in it changed.

---

## 0. The one-sentence product question

> **On `/posts`, should a project appear as a row that contains its series — or
> is `/posts` deliberately a flat list of posts and series, with projects
> existing only in the sidebar?**

**Answered 27 Aug 2026: yes.** A project is a row that contains its series, on
`/posts` as in the sidebar. Step 7 is unblocked and takes option A. My
recommendation, and the reason, is in §6.

---

## 1. Re-measured numbers

Every LOC figure in the plan is **exactly right**. Nothing was stale.

| File                                              | Claimed | Actual    |
| ------------------------------------------------- | ------- | --------- |
| `SideBar/ActivePostsSection.tsx`                  | 431     | **431**   |
| `SideBar/PostItem.tsx`                            | 455     | **455**   |
| `SideBar/SeriesGroup.tsx`                         | 265     | **265**   |
| `SideBar/ProjectGroup.tsx`                        | 223     | **223**   |
| `SideBar/SubTabList.tsx`                          | 231     | **231**   |
| `SideBar/CollapsedRail.tsx`                       | 147     | **147**   |
| **sidebar subtotal**                              | 1,752   | **1,752** |
| `PostsListView/PostsListView.tsx`                 | 600     | **600**   |
| `PostsListView/components/SeriesRow.tsx`          | 385     | **385**   |
| `PostsListView/components/PostRow.tsx`            | 275     | **275**   |
| `PostsListView/components/PostRowContextMenu.tsx` | 228     | **228**   |
| `PostsListView/components/BulkActionBar.tsx`      | 199     | **199**   |
| **/posts subtotal**                               | 1,687   | **1,687** |
| **total**                                         | ~3,400  | **3,439** |

**But the 3,439 figure badly overstates the addressable duplication.** The plan
counted whole files; most of those lines are row _chrome_ that cannot merge
(§4). The plan also omitted the files where the real duplication actually lives:

| Not counted by the plan                  | LOC |
| ---------------------------------------- | --- |
| `SideBar/hooks/useSidebarDnd.ts`         | 443 |
| `SideBar/hooks/useSidebarActions.ts`     | 331 |
| `SideBar/hooks/useSidebarBulkActions.ts` | 188 |
| `utils/posts/seriesGrouping.ts`          | 289 |

Already-extracted shared primitives, confirmed in use on both surfaces:
`hooks/useRowSelection.ts` (148), `lib/dragDrop.ts` (83), `theme/treeRow.ts`
(174).

---

## 2. Claims verified — and the two that are wrong

### ✅ Two `RootItem` types, both named `RootItem`, structurally different

- `utils/posts/seriesGrouping.ts:36` — `ProjectGroupItem | SeriesGroupItem`.
  Nested, children **embedded** (`SeriesGroupItem.posts: Post[]`), discriminator
  field is **`type`**, standalone posts are modelled as a one-element array
  (`{ type: "standalone", posts: [post] }`).
- `PostsListView.tsx:46` — `{ kind: "post" | "series"; id; rank; post|series }`.
  Flat, children **not embedded** (looked up via a separate `seriesPostsById`
  memo, `PostsListView.tsx:70-81`), discriminator field is **`kind`**.

They are reconcilable — both are "root entry + its rank + its children", and the
sidebar's is strictly more expressive — but they share only a name today.

### ✅ `SeriesRow` has no `draggable`; reorder is ⋯-menu-only

`grep -rn draggable src/components/posts/` returns exactly one hit:
`PostRow.tsx:159` (the grip). `SeriesRow` is a drop _target_
(`SeriesRow.tsx:114-133`) but never a drag _source_. Meanwhile the sidebar has
`SeriesGroup.tsx:105` and `ProjectGroup.tsx:107` both `draggable`.

### ✅ …and it is an **omission, not a decision** — git proves it

`git log --follow` on `SeriesRow.tsx` surfaces commit **`7555b861`**
_"feat(ordering): interleave root list + reorderable series"_, whose message
ends:

> **"Native drag-reorder is not included yet — menu reorder covers the unified
> list."**

Post drag-reorder then landed separately in `4990e10f` _"feat(ordering):
drag-to-reorder root posts"_ — **posts only**. The sidebar got the general case
later in `d7e2ead1` _"feat(sidebar): drag to reorder and move posts/series"_. So
`/posts` was left one increment behind and never caught up. All the plumbing
already exists on `/posts`: `handleReorderRoot` routes series to
`actions.moveSeries` (`PostsListView.tsx:480-482`), and `moveDraggedInto`
(`:356-379`) already handles series ids in a dragged block. **Only the
`draggable` attribute and an `onDragStart` on the `SeriesRow` header are
missing.**

### ❌ WRONG: "`/posts` is a strict subset of the sidebar"

It is not a subset in either direction. Two hard divergences:

1. **The sidebar does _not_ render one interleaved root list.**
   `ActivePostsSection.tsx:106-123` splits the rank-ordered root into **two
   visual sections**: standalone posts → **"Notes"**; projects + ungrouped
   series → **"Projects"**. `/posts` renders them interleaved in one list
   (`PostsListView.tsx:88-104`). Same rank space, deliberately different
   presentation. Any "one tree model" must therefore carry a _partition_
   concept, not just a node list.

2. **`PostsListView` serves a second tree the sidebar has no concept of.**
   `PostsView.tsx:262-269` renders `/posts/[seriesId]` compact view as
   `<PostsListView posts={series.posts} series={[]} />` — i.e. **"the contents
   of one series as the root list"**. The sidebar never renders a non-root
   container as its root. This is where the bug in §3 comes from.

### ❌ WRONG (minor): the sidebar model carries a dead field

`SeriesGroupItem.sortKey` (`seriesGrouping.ts:15`) is **written 3×** (`:148`,
`:159`, `:193`) and **read 0×** anywhere in `src`. Its only two feeders,
`getPostCreatedAtTime` (`:60`) and `getSeriesCreatedAtTime` (`:89`), exist
solely to populate it. ~20 LOC of leftovers from the pre-rank date-sorting era.
`knip` won't catch this (it's a file-local dead field, not an unused export).

---

## 3. 🔴 A live bug, caused directly by the flat model

**On `/posts/[seriesId]` in compact (list) view, reordering a post silently
removes it from the series.**

Chain, all verified:

1. `PostsView.tsx:262-269` →
   `<PostsListView posts={series.posts} series={[]} />`.
2. With `series={[]}`, every row is a **root** `PostRow`
   (`PostsListView.tsx:532`), wired to `handleReorderRoot` (`:542`) and
   `handleReorderDrop` (`:546`).
3. `handleReorderRoot` (`:476-479`) dispatches
   `movePost({ id, destination: {}, between })`. `handleReorderDrop` →
   `moveDraggedInto` (`:369-372`) does the same, because `seriesIdSet` is empty.
4. `app/api/documents/[id]/move/route.ts:15-17` — _"`destination` fully
   specifies the container — it is **not** a partial patch."_ `:44` →
   `seriesId = null`.
5. `repositories/ordering.ts:145` — `data: { seriesId, parentId, rank }`,
   written unconditionally. **The post is detached from its series.**

Both the ⋯ → _Move up/down/top/bottom_ menu **and** grip-drag reorder trigger
it. Mitigating: `postsListDensity`/`seriesPostsView` defaults to `"grid"`
(`PostsView.tsx:100-103`), so a user must opt into list view first.

The correct container-preserving code already exists in the same file —
`handleReorderPost` (`:437-462`) reads `doc.seriesId ?? doc.parentId ?? root` —
but it is only ever passed to `SeriesRow` as `onReorderPost`, and in
series-detail mode there are no `SeriesRow`s.

**This is the strongest argument in the brief.** The flat `RootItem` has no
notion of _which container it is rendering_; it hardcodes "root". The sidebar
model cannot express this bug, because `useSidebarDnd` resolves a `container`
per row (`useSidebarDnd.ts:26-30`, `:111-176`) and routes each dispatch by it
(`:362-413`). **This is a correctness argument for unification, not an aesthetic
one.**

---

## 4. Where the duplication actually is (and where it is not)

### Genuinely duplicated — recoverable

| Concern             | Sidebar                                  | `/posts`                          | Verdict                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ---------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bulk actions**    | `useSidebarBulkActions.ts` (188)         | `PostsListView.tsx:155-308` (154) | **Near-verbatim.** Same three ops, same confirm copy word-for-word, same `canMerge` rule (`≥2 && no series`). The sidebar hook's own docstring says _"mirroring the posts page `BulkActionBar`"_. Only real difference: sidebar reads posts from the store, `/posts` from props; sidebar owns menu-anchor state, `/posts` renders a bar. **~150 LOC.** |
| **Drag & drop**     | `useSidebarDnd.ts` (443)                 | `PostsListView.tsx:310-432` (123) | The sidebar hook is a **strict superset**: post/series/project × root/series/project, with a `classify()` state machine. `/posts` hand-rolls the post-only subset. **~120 LOC**, and adopting it _fixes §3 and delivers §5 for free_.                                                                                                                  |
| **Root derivation** | `groupRootItems` + helpers (~120 of 289) | `PostsListView.tsx:70-116` (47)   | **~45 LOC.**                                                                                                                                                                                                                                                                                                                                           |
| **Dead model code** | `sortKey` + 2 feeders (~20)              | —                                 | **~20 LOC.**                                                                                                                                                                                                                                                                                                                                           |
|                     |                                          |                                   | **≈ 335 LOC**                                                                                                                                                                                                                                                                                                                                          |

### NOT duplicated — do not try to merge

`PostRow` (275) / `SeriesRow` (385) vs `PostItem` (455) / `SeriesGroup` (265)
are **not** the same component wearing different hats:

- **DESIGN.md §17.2 forbids it.** The _"Sidebar carve-out"_: the sidebar has a
  user-adjustable text size (`useSidebarFontSize`), so rows size in **`em`** via
  the `SB_FONT` ladder and are _exempt_ from the fixed `dense`/`micro` variants
  that `/posts` rows are _required_ to use. One row component cannot satisfy
  both without a font-mode prop that defeats the point.
- **Different densities.** `SeriesGroup` `minHeight: 26`, `ProjectGroup` `24`;
  `PostRow`/`SeriesRow` `36`/`44`. (DESIGN.md §17.4 specifies ~28–32px — _both_
  surfaces are off-spec, in opposite directions. Separate finding.)
- **Different jobs.** `PostItem` renders a nav link (`SafeNavigationLink`), the
  active route, a dirty dot from `ui.tabs.dirtyTabIds`, and an expandable
  `SubTabList`. `PostRow` renders a checkbox, a grip, a relative date, and a
  single-vs-double-click rename/navigate timer (`PostRow.tsx:80-94`).
  `SeriesGroup` toggles a folder and never navigates on click; `SeriesRow`
  toggles, and its children truncate to 3 with a "View all N posts →" link past
  20 (`SeriesRow.tsx:26-27, 359-380`).
- **Different click semantics** — already encoded in the shared primitive:
  `useRowSelection(ids, "clear")` for the sidebar (plain click navigates) vs
  `"toggle"` for `/posts` (plain click toggles a checkbox). This is the seam
  working as designed; it is evidence the primitives were the right cut.

**So the honest ceiling is ~335 LOC, not ~1,700.** The plan's author should
expect roughly a **10% reduction of the counted surface**, not 50%.

---

## 5. Should series be draggable on `/posts`?

**Yes — and it is close to free.** Evidence in §2: `7555b861` explicitly
deferred it, the dispatch paths already exist (`PostsListView.tsx:366-368`,
`:480-482`), and `moveSeries` is a shipped full-stack action
(`/api/series/[id]/move`, `repositories/ordering.ts:229`).

There is a subtlety worth knowing: **series already move by drag on `/posts`
today, but only accidentally** — via multi-select. Check a series' checkbox,
then grab a _post_ in the same selection; `handleDragStart` (`:322-332`) expands
to the whole selection and `moveDraggedInto` routes the series id to
`moveSeries`. So the capability is live and reachable, just not from the obvious
gesture. That makes the current state genuinely inconsistent rather than
minimal.

Cost if done standalone: add `draggable` + `onDragStart` to the `SeriesRow`
header, plus `onReorderDragOver`/`onReorderDrop`/`dropIndicator` on it (the
`SeriesRow` header currently consumes drag events for drop-_into_, so the two
modes must be disambiguated by dragged kind — exactly what
`useSidebarDnd.classify()` already does at `:231-282`). **~40 LOC standalone, ~0
LOC if `/posts` adopts `useSidebarDnd`.**

---

## 6. The product question, both answers

### If **YES** — `/posts` renders projects

**Unified model.** Promote the sidebar's shape to `src/lib/tree/` (not
`utils/posts/`, which is post-specific):

```ts
// src/lib/tree/model.ts
export type TreeNode =
  | {
    kind: "project";
    id: string;
    rank: string | null;
    project: Project;
    children: TreeNode[];
  }
  | {
    kind: "series";
    id: string;
    rank: string | null;
    series: Series;
    children: TreeNode[];
  }
  | {
    kind: "post";
    id: string;
    rank: string | null;
    post: Post;
    children: TreeNode[];
  };

export type Container =
  | { type: "root" }
  | { type: "series"; seriesId: string }
  | { type: "project"; projectId: string }
  | { type: "tabs"; parentId: string };

export function buildTree(input: {
  posts: Post[];
  series: Series[];
  projects: Project[];
  /** The container being rendered as the root — `{type:"series"}` for /posts/[id]. */
  root: Container;
}): TreeNode[];
```

Uniform `kind` (kills the `type`/`kind` split), uniform `id`+`rank` hoisted
(what `/posts` got right), uniform `children` (kills the one-element-array
standalone encoding), plus the **`root: Container`** field that neither model
has and whose absence is bug §3.

Then `useSidebarDnd` moves to `src/lib/tree/useTreeDnd.ts` unchanged in
substance — its only coupling to `RootItem` is the one memo at `:111-176`, which
becomes a `buildIndex(nodes)` over `TreeNode`. Both surfaces consume it.

**Each consumer gives up / gains:**

- **Sidebar gives up:** nothing structurally. Its Notes/Projects split
  (`ActivePostsSection.tsx:106-123`) becomes a `partition` applied to the shared
  node list at render time.
- **`/posts` gives up:** the flat assumption. Gains: series drag, project drag,
  container-correct reorder (bug §3 fixed by construction), and a
  `/posts/[seriesId]` view that knows it is inside a series.

**New UI `/posts` needs:** a project row component (~150 LOC — no sidebar reuse,
per §4), project-as-drop-target styling (`theme/treeRow.ts` `dropIntoSx` already
covers the tint; `ProjectGroup` uses a band rule rather than a pill outline —
`/posts` must pick one), an empty-project state, project rows in the bulk-delete
routing (`PostsListView.tsx:222` currently branches series-vs-post only), and a
"New project" affordance. `capabilities().projects` is signed-in-only
(`lib/capabilities.ts`), so `/posts` needs a guest branch the sidebar already
has (`ActivePostsSection.tsx:355`).

### If **NO** — `/posts` stays projectless

A shared _node type_ still pays, but much less, and the honest framing is:
**these are two views of one tree with genuinely different jobs, and the payoff
is in the engines, not the shape.**

Concretely, without projects on `/posts` you still get:

- `useSidebarDnd` → `useTreeDnd`, adopted by `/posts` with `Container` support.
  **Fixes bug §3, delivers §5, −120 LOC.** No product question involved.
- Bulk actions unified. **−150 LOC.** No product question involved.
- `sortKey` and its feeders deleted. **−20 LOC.**

You would _not_ unify `RootItem` itself — a `TreeNode` union carrying a
`"project"` arm that `/posts` structurally cannot receive is a type that lies
about one of its two consumers. Better to keep the two shapes and share the
engines that operate on them via a small structural interface
(`{ id, rank, kind, children }`).

---

## 7. LOC delta and risk

| Option                                          | Δ LOC                                                                                | Riskiest files                                                                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Full unify, `/posts` gets projects**       | −335 shared, **+~200 new project UI** → **net ≈ −135**, plus a genuinely new feature | `useSidebarDnd.ts` (443, the `classify` state machine — every drop semantic lives in one switch); `PostsListView.tsx` render (`:529-584`); `seriesGrouping.ts` `groupRootItems` |
| **B. Engines only, no projects on `/posts`**    | **≈ −290**                                                                           | `useSidebarDnd.ts`; `PostsListView.tsx:155-432`                                                                                                                                 |
| **C. Stop at the primitives already extracted** | 0                                                                                    | — but bug §3 stays live                                                                                                                                                         |

**What has broken here before, specifically:**

- **Drag reorder across series boundaries** — this is _currently broken_, §3.
  Any option that touches `movePost({ destination })` must be exercised on
  `/posts/[id]` compact view, which is the exact path with no test coverage
  (CLAUDE.md: no test runner is wired up).
- **Multi-select drag** — fixed once already in `bf82356f` _"fix(posts): drag
  the whole selection"_. Both surfaces now expand a grab to the selection
  (`PostsListView.tsx:327-330`, `ActivePostsSection.tsx:161-169`) and chain
  ranks so the block keeps its order (`:375`, `useSidebarDnd.ts:415`). A unified
  engine must preserve the **chained-rank** loop; a naive rewrite that
  dispatches all moves with the same bracket will silently scramble multi-row
  order.
- **Degenerate ranks** — `bracketForDrop` folds in the colliding-rank guard that
  used to 500 `/posts`. Both call sites rely on its `null` return
  (`PostsListView.tsx:391`, `useSidebarDnd.ts:369`). Do not inline it away.
- **Memoization** — `PostsListView.tsx:318-321` and `ActivePostsSection.tsx:181`
  both carry explicit comments about depending on `selectedIds` rather than the
  whole selection object, because the rows are `React.memo` and a churning
  handler identity re-renders every row mid-drag. A refactor that passes a
  combined context object will reintroduce this.

---

## 8. Recommendation

**Do not do the tree-model unification as scoped. Do a narrower, higher-value
version of it — and do it in this order.**

The plan's premise — "the biggest win available, ~3,400 LOC" — does not survive
contact with the code. The LOC _counts_ were right; the _inference_ from them
was not. Roughly 1,400 of those lines are row chrome that DESIGN.md §17.2
explicitly forbids merging, and the plan omitted the three files
(`useSidebarDnd`, `useSidebarBulkActions`, `seriesGrouping`) where the actual
duplication lives. Realistic ceiling: **~335 LOC, ~10%.**

But the investigation turned up something better than a LOC win: **`/posts`
silently ejects posts from their series on reorder (§3)**, and the cause is
precisely the missing model concept the plan intuited — the flat `RootItem` has
no `Container`. So the plan pointed at the right defect for the wrong reason.

**Step 7, ordered by value density:**

1. **Fix bug §3 first, standalone, ~10 LOC.** Give `PostsListView` a
   `rootContainer` prop; `handleReorderRoot` and `moveDraggedInto` route
   `destination` through it instead of `{}`. **Do not gate a live data bug
   behind a refactor.** This needs no product answer.
2. **Promote `useSidebarDnd` → `src/lib/tree/useTreeDnd.ts`** by extracting the
   `RootItem` memo (`:111-176`) behind a `buildIndex()` over a minimal
   structural node interface. Adopt on `/posts`. **−120 LOC, and series drag
   (§5) falls out for free**, as does a second, structural guard against bug §3.
3. **Unify bulk actions** — `useSidebarBulkActions` parameterised by post source
   and presentation (menu vs bar). **−150 LOC. Zero product risk, near-verbatim
   duplication, do this regardless of every other answer.**
4. **Delete `sortKey` + `getPostCreatedAtTime` + `getSeriesCreatedAtTime`.** −20
   LOC.
5. **Only then** revisit one `TreeNode` — and only if the product answer is
   _yes_. If it is _no_, stop; steps 1–4 capture ~87% of the available LOC win
   and 100% of the correctness win, and a union type with an arm one consumer
   cannot receive is worse than two honest types.

**On the product question itself,** for whoever answers it: the sidebar already
treats projects as signed-in-only (`capabilities().projects`) and gives them
their own titled section rather than interleaving them with notes. That is a
navigation-surface idea. `/posts` is a management surface — checkboxes, bulk
delete, merge-into-tabs, move-to-series. Projects would need a real management
story there (bulk-move series into a project? delete a project from `/posts`?)
before the row is worth building. **My reading of the evidence is that the
answer is "no", and that steps 1–4 are the whole job.** But that is a product
call, not a code one, which is why it is the one sentence at the top.
