# Workspace panes, routing, and the AI command surface

**Status: all five phases landed, plus §8.2 (31 Jul 2026).** Sits alongside
[ide-redesign.md](./ide-redesign.md), which proposed converging the app on an
IDE shell. That convergence is ~done at the _chrome_ level. This plan is about
the layer underneath it: what "open" means, and who is allowed to say it.

| Phase                                      | Status   | Commit       |
| ------------------------------------------ | -------- | ------------ |
| 1 — command registry                       | **done** | `986e4a72`   |
| 2 — `ui.workspace` panes                   | **done** | `3f4545a7`   |
| 3 — generate AI tools + thread persistence | **done** | `29394d5c`   |
| 4 — route-group split                      | **done** | `dd51f137`   |
| 5 — two panes                              | **done** | `5ced4505`   |
| §8.2 — persist panes                       | **done** | `b77ab65b`   |
| URL follows focus                          | **done** | `972b58e3`   |
| pane tree above the `[[...id]]` segment    | **done** | _1 Aug 2026_ |

**Partly verified in a browser (31 Jul – 1 Aug 2026).** Sign-in is OAuth, so the
authenticated UI is still unreachable — but the workspace runs for a **guest**
against IndexedDB, and a two-pane layout seeded into the `workspaces` store
(§8.2's own record) restores through the ordinary path. Driven headless over
CDP, that confirms: two `ConnectedEditor`s render side by side, the focused
pane's accent bar tracks a real click, focus-follows-click works, the URL
follows focus, and a reload comes back focused on the pane last clicked.

Extended 1 Aug: `pane.split` holds its second pane across the navigation it
issues, a document-to-document change keeps both panes and both live editors,
and leaving `/edit` closes the panes without touching the stored layout. That
run is what caught the segment-remount bug below — **the earlier session's "not
observed" list was load-bearing, and `pane.split` was on it.**

Still not observed: anything cloud-backed, the resize drag, read mode, undo
history across a tab switch, and the sidebar's own context menu (the guest
sidebar tree renders no rows for seeded posts — a fixture gap, not a known app
bug, but it means the split was driven through `openPane` + a real `router.push`
rather than through the menu item).

### Corrections found while implementing

- **§2.4's consumer table was missing three**: `EditorTabPanel.tsx` and
  `components/Diff/index.tsx` both gated on `ui.diff.open`, and
  `Layout/EditorTopBar.tsx` derived a docId from the pathname for its breadcrumb
  — a fourth parse site nobody had listed. `RightRail/index.tsx` derived `mode`
  and `rootId` from the pathname too, not just `activeTabId`.
- **The diff feature is dead code.** Nothing sets `ui.diff.old`/`.new`, and the
  only writer of `open` set it to `false`, so `DiffView` has been unreachable.
  §5.1 #4 treats a dead singleton as a live one. Shape preserved per-pane rather
  than deleted, since removing a feature was out of Phase 2's scope.
- **`rootId` can hold a handle rather than an id.** `/edit/[id]` accepts either
  and the raw URL segment is passed straight through, so `PostItem`'s
  `rootId === post.id` comparison silently fails on handle URLs. Wants resolving
  at the deep-link seam in Phase 4.
- **`EditSeriesForm` pushes `/series` after a delete, which is not a page** —
  only `/series/[id]` exists, and it 308s to `/posts/[id]`. Deleting a series
  currently 404s. Left alone as a behaviour change; one-line fix is
  `workspace.openSection({ section: "library" })`.
- **`getConnection`'s `onupgradeneeded` can resolve a closed database**
  (`src/indexeddb/index.ts`) — it calls `db.close()` then `resolve(db)`. Masked
  today because the first open after a version bump is `setupIndexedDB`'s, which
  discards the value. One refactor away from losing a guest's drafts on upgrade.

### Corrections found in phase 5

- **`document.open` had to stop being a `router.push`.** With two panes, opening
  a post the _other_ pane already holds must move focus — and a push of the path
  the address bar already holds is a no-op, so the click did nothing. It now
  dispatches `openPane` (which owns the §5.2 invariant) and pushes second.
- **`openPane`'s contract changed shape.** An omitted `paneId` used to mint a
  pane; it now means "retarget the focused one", which is what a sidebar click,
  the palette and a deep link all mean. Naming a `paneId` is the "_new_
  viewport" form, and is what `pane.split` uses.
- **Three singletons the §5.1 table missed**, all found the same way — by asking
  what breaks when two of something exist:
  - **The top bar's tab strip** (`TopBarTabsContext`). One strip, two panes with
    tab groups. Only the focused pane publishes; the handover is a `setTabBar`
    effect _cleanup_ rather than an unmount-only clear.
  - **`PostItem`'s "is this post open?"** was
    `selectFocusedPane(state).rootId
    === post.id`, so with two panes only
    one of the two open posts was marked. Now `selectPaneRootedAt`.
  - **`SubTabList`'s tab switch** dispatched `setActiveTab` at the _focused_
    pane while the row it was drawn under might belong to the other one — it
    would have set a pane's active tab to a document that pane does not hold. It
    takes the owning `paneId` as a prop now.
- **Read mode is `editor.setEditable(false)`, not a second component tree.**
  `/view/[id]` is the public page and is no longer reachable from
  `document.open` at all; the workspace's own read mode is the same pane, the
  same Lexical instance and the same scroll offset.
- **`usePostLoader`'s `setDiffOpen(false)` still targets the focused pane**, not
  its own. Harmless while the diff feature is dead code (see above), wrong the
  day it is not.

### Corrections found while implementing §8.2

- **The key cannot be known when the restore has to run.** Gating the deep-link
  seam on the session — a network call — is the regression §8.2 was told not to
  ship, so the restore guesses the user from a `localStorage` note of who was
  signed in last and the middleware corrects it (`workspaceKeyChanged`) if the
  session disagrees. Without the correction, a normal sign-out writes the
  previous account's layout into the guest record and the next account inherits
  it — which is exactly the failure keying by user was supposed to prevent.
- **`closeAllPanes` on unmount is a delete, once panes are persisted.** It fires
  on every navigation out of `/edit`, so a persist-on-change middleware would
  erase the layout on the way out the door. The writer refuses an empty
  workspace, which is safe because the deep-link seam opens a pane the moment
  the route mounts — "zero panes" is a transient, not a state a user sits in.
- ~~**`pane.split` does not push the URL**~~ — **fixed.** It pushes
  `/edit/<rootId>` after the dispatch, as `document.open` does, so the address
  bar names the pane that was just split off and is now focused. It pushes the
  _resolved_ id rather than the caller's reference, which also keeps clear of
  the unresolved-handle path that remounts the pane tree and would destroy the
  split.
- **The restore had to be bounded.** `getConnection` waits ten seconds for
  `setupIndexedDB`, and the seam is downstream of the read — a browser with no
  usable IndexedDB would have shown a blank editor for that long. Two seconds,
  then open without a layout.
- **Deleted documents are deliberately not validated.** Posts are not loaded
  when the restore runs, and a pane may legitimately hold a document absent from
  the session's list — a fork source, or the well-known `notes` post, which is
  created on first open. `usePostLoader` already ends at "Post Not Found" inside
  the pane, without touching its neighbour.

### Open after phase 5

- ~~**The URL does not follow focus**~~ — **closed** (_uncommitted_). The
  premise that kept it open was wrong: rewriting the URL on a focus change is
  **not** a server round trip. Next 15 patches `window.history.replaceState`
  (`client/components/app-router.js`) to dispatch `ACTION_RESTORE`, and
  `restoreReducer` only re-points `canonicalUrl` — it reuses the existing router
  cache and tree and does not reference `fetchServerResponse` at all, unlike
  `navigateReducer`. So `usePathname()` follows the address bar and the
  `force-dynamic` page is never re-requested. Verified in a real browser as well
  as in the source: four clicks between two panes produced **zero** `?_rsc=`
  requests and **zero** new history entries.

  `WorkspacePanes` now projects `selectFocusedDocId` — _not_ the pane's
  `rootId`, which would reset `activeTabId` and make a click between panes
  silently switch tabs — back onto the URL, in the same effect as the deep-link
  replay and immediately after it. Three guards, all in `lib/workspaceUrl.ts`
  and unit-tested: only once `workspaceHydrated`, only on `/edit`, and only
  while the URL names a document some pane already holds. The last one is the
  subtle one — until then the URL is still an _input_ (an unreplayed deep link,
  or a `document.open` push that has not landed), and overwriting it would make
  `HistoryUpdater` skip the pending push and drop the entry the user came from.

  Two consequences worth stating. A **handle** URL (`/edit/my-post`) survives
  until focus actually moves, and is then rewritten to the canonical id, because
  panes are keyed by id and no other spelling can name the focused one. And
  **closing a pane** is the one deliberate way to reach the state that last
  guard refuses — the URL naming a document no pane holds — so the projection
  cannot repair it and `pane.close` owns its own rewrite, as `pane.split` and
  `document.open` own their pushes. It targets the surviving pane's focused
  document, read back from the store after the dispatch rather than predicted,
  so `closePane`'s focus rule is not copied out. It uses `rewrite`
  (`history.replaceState`) rather than `push`: the survivor is not somewhere the
  user navigated to, and a history entry naming it would send Back to a URL
  whose pane is gone — which the deep-link seam would then replay, silently
  retargeting the survivor instead of restoring anything.

  With that, **every** way focus moves keeps the URL honest: opening pushes,
  splitting pushes, clicking projects, closing rewrites.
- **Clicking a post title in `/posts` now opens it in the workspace in read
  mode** rather than navigating to the public `/view/[id]`. That follows §4.4,
  but it is a visible product change rather than a refactor.
- ~~**Navigating to a handle URL for a post not in the store** unmounts the pane
  tree for a beat, destroying a split~~ — **the diagnosis was too narrow, and
  the bug was much worse than it reads. Fixed 1 Aug 2026.**

  It is not the handle path. `/edit/[[...id]]` is a catch-all and Next keys a
  router segment by its _param value_, so `/edit/<a>` and `/edit/<b>` are
  different segment nodes: **every** document-to-document navigation unmounted
  everything `page.tsx` rendered, id or handle. `WorkspacePanes` dispatches
  `closeAllPanes` from its unmount cleanup, so the workspace was wiped each
  time. With one pane the result is indistinguishable — you get one pane either
  way, which is why this shipped — but with two it destroys the split. And
  `pane.split` pushes such a URL itself, so **a split tore itself down about a
  second after appearing**, which is how it was finally reported.

  There was a second defect behind it, and that one lost data. On the remount
  the new `WorkspacePanes` renders while `hydrated` is still `true` from the
  outgoing instance, so its restore effect returns early and never reads
  storage, while the deep-link seam mints a fresh single pane. By the time the
  restore effect re-runs, `restoreWorkspace`'s "do not overwrite what is already
  open" guard sees that minted pane and declines — and the persistence
  middleware then writes the one-pane layout over the stored two-pane record.
  **The saved split was destroyed, not merely hidden.** Observed directly:
  stored `[left@a, right@b]` became `[<fresh uuid>@b]`.

  **Fixed by hoisting the pane tree into `(workspace)/edit/layout.tsx`.** A
  layout is not re-keyed by a child segment's params, so a document change is
  now a prop change — which the deep-link seam already handles by dispatching
  `openPane` — and nothing unmounts. `page.tsx` renders `null` and keeps only
  what is genuinely per-document: `generateMetadata` and `force-dynamic`.
  Leaving `/edit` still unmounts the layout, so `closeAllPanes` keeps its
  meaning.

  Verified over CDP against a dev build, both directions. Before: two panes
  became `dom=0 → 1` and storage was clobbered. After: `/edit/a → /edit/b` holds
  two panes and two live editors with focus handing to the pane that holds `b`,
  the stored record is untouched, `pane.split` stays split for at least ten
  seconds, and navigating out to `/posts` still closes the panes while
  preserving what was stored.

  The restore-ordering fragility above is now unreachable — the only remaining
  remounts are entering and leaving `/edit`, and `closeAllPanes` sets `hydrated`
  false on the way out, so the next mount reads storage properly. It is still
  latent, and worth hardening if `WorkspacePanes` ever remounts for another
  reason: the guard cannot currently tell a restored pane from one the seam just
  minted.
- **`FloatingToolbar` in read mode** was not verified to suppress itself when
  the editor is not editable.

### §5.2 had a second half, in the tab list

`openPane` stops a pane being **rooted** at a document another pane holds, and
that was taken to be the whole invariant. It is not: a pane's `tabIds` arrive
later, from a fetch. Open a child document in one pane, then open its parent
post in the other, and the parent's children come back naming a document the
first pane is already showing.

The consequence is the one §5.2 exists to prevent, not a cosmetic one.
`TabbedDocumentEditor` renders `tabIds.map(…)` — an `EditorTabPanel` **per
entry, unconditionally** — and each panel registers a save callback in
`saveRegistry` under its document id. The second to mount replaces the first,
and one pane stops persisting with no error.

Fixed in the reducer, beside the invariant it belongs to: `setPaneTabs` admits
only tab ids no other pane holds (a pane always keeps its own root, or it would
have nothing to render), and `addTab` refuses one outright. The derived list
yields to the explicit one — a pane rooted at a document got there because
someone asked for it.

**Related, not fixed:** `TabbedDocumentEditor`'s `_mountedTabIds` is written and
never read, so the "lazy-mount pattern" its comment describes does not happen —
_every_ tab of a tabbed post mounts a full editor with the whole plugin set
(MathLive, Excalidraw, Geogebra). That makes §5.4's performance note worse than
it assumed, and it is why the collision above bites immediately rather than only
once a user visits the tab. Changing it touches undo-history retention, so it
wants its own pass.

### Carried forward from phase 3

- `InlineCopilotBar` still does not persist (`persist={false}`). It remounts per
  `pathname:documentId` and auto-expands when a thread is non-empty, so
  persisting it as-is would resurrect old conversations over the document on
  every navigation. A UX call, not plumbing.
- Thread scope is a document id or the literal `"workspace"`. Faithful while
  there is one workspace per user; revisit if phase 5 gives panes independent
  conversations.

---

## 0. The thesis

Three complaints motivated this: the hard view/edit separation, one document at
a time, and wanting an AI that can do anything a user can. They have one root
cause.

> **There is no first-class answer to "what is open."** The URL is the answer,
> and it can only hold one document, so the app can only hold one document — and
> the AI can only see what it can parse out of a path string.

Two consequences worth naming up front:

**The seam is in the wrong place.** Today it is drawn at `view │ edit`. It
belongs at `public │ workspace`. `/view/[id]` for an anonymous reader is a
genuinely different application — SSR, cacheable, no store, no sidebar.
`/view/[id]` for the document's own author is a _mode toggle_ that currently
costs a full navigation and a second component tree (`ViewDocument` 242L vs
`TabbedDocumentEditor` 454L).

**The data flow is backwards.** `AppLayoutContent.tsx:50-67` calls
`usePathname()`, splits segments, and derives which document the Copilot is
talking about — with a rule that view routes are authoritative and edit routes
follow `activeTabId`. That code exists _only_ because workspace state is not
represented anywhere. It is the clearest symptom in the codebase.

The fix is to invert it: **workspace state is the source of truth, and the URL
is a projection of it.** The URL stays an input in exactly one place — cold
load, where a deep link replays as a command.

---

## 1. What is already true

This plan is cheaper than it looks, because the hard parts are already shipped.

### 1.1 Multiple live Lexical editors already work

`EditorTabPanel.tsx` mounts a **complete `ConnectedEditor` per document**, and
every open document is mounted simultaneously:

- own `editorRef`, own `useSave`, own `useDirtyTracking`, own `usePostLoader`
- own Lexical namespace (`blog-simple-${docId}`) — no cross-instance bleed
- `saveRegistry` keyed by docId; `triggerSave()` persists every open document
- inactive panels hidden with `display: none` **specifically so undo history
  survives a tab switch** (`EditorTabPanel.tsx:157`)

Lexical has no global singleton — each `LexicalComposer` owns its editor and its
own React context. Split view is therefore **not** a Lexical problem.

At the layout layer the change is close to literally:

```
display: isActive ? "block" : "none"    →    a pane grid
```

Every open document is _already in the DOM_. Split view stops hiding them.

### 1.2 The shell is already an IDE

`AppLayoutContent` renders a five-column grid that persists across every route
in `(appLayout)`:

```
ActivityRail │ SideBar │ content (1fr) │ Copilot │ RightRail
```

Only the content column is single-slot. That is the whole gap.

### 1.3 The command palette is a proto-registry

`CommandPalette.tsx` (449L) already models commands as `{ id, label, run }` and
already owns the read/edit mode toggle at line 200. It is the seed of §3 — the
registry is an _extraction_, not a greenfield build.

### 1.4 The view/edit split is already fake at the state layer

`ViewDocument.tsx` dispatches `initTabs`, `setActiveTab`, and `clearTabs` (lines
82–103) — the _same global slice_ the editor drives. The two routes already
share the state; they just don't share the seam. This both proves the split is
artificial and explains why Phase 4 has to come after Phase 2.

---

## 2. `ui.tabs` → `ui.workspace`

### 2.1 The name collision, first

`tabs` is **already taken** and means something else: the child documents of one
post (`mergePostsIntoTabs` in `postThunks.ts:220`, `tabLabel` in the Prisma
schema, `parentId` nesting). That is a _content model_, not a workspace model.

**Vocabulary decision — apply from Phase 2 onward:**

| Term     | Means                                  | Lives in            |
| -------- | -------------------------------------- | ------------------- |
| **pane** | A viewport onto a document. New.       | `ui.workspace`      |
| **tab**  | A child document of a post. Unchanged. | `Document.parentId` |

A pane contains a tab group. Do not let "tab" drift to mean "open document" — if
it does, this whole refactor becomes unreadable.

### 2.2 Current shape

```ts
ui.tabs: {
  rootId: string | null,
  tabIds: string[],
  activeTabId: string | null,
  dirtyTabIds: string[],
}
```

Reducers in `app.ts:216-270`: `initTabs`, `setActiveTab`, `addTab`, `removeTab`,
`reorderTabs`, `markTabDirty`, `markTabClean`, `clearTabs`.

### 2.3 Target shape

```ts
ui.workspace: {
  panes: Array<{
    id: string,              // stable; the AI can name it
    rootId: string,
    tabIds: string[],
    activeTabId: string | null,
    mode: "read" | "write",  // replaces the view/edit route split
    diffOpen: boolean,       // was the global ui.diff.open
  }>,
  focusedPaneId: string | null,
}

ui.dirtyDocIds: string[]     // hoisted OUT of panes — see below
```

Three deliberate calls:

**`dirtyDocIds` is global, keyed by document.** Dirty is a property of a
document, not of a viewport. Keeping it per-pane would mean the same document
open twice reports two answers. `store/index.ts:104` (`hasUnsavedChanges`) then
stays a one-line selector.

**`mode` is per-pane.** This is what dissolves the view/edit route split — read
mode becomes a state flip with no navigation, no remount, and preserved scroll.

**Panes get ids at N=1.** Even before split view ships. Costs nothing now;
retrofitting stable ids after the AI has started referring to panes is painful.

### 2.4 The 12 consumers

Every site that touches `ui.tabs` today, and what happens to it:

| File                                        | Reads/Writes                          | Becomes                               |
| ------------------------------------------- | ------------------------------------- | ------------------------------------- |
| `EditDocument/TabbedDocumentEditor.tsx`     | all 8 reducers, `state.ui.tabs`       | scoped to its own pane id             |
| `views/ViewDocument.tsx:49,82,86,98,103`    | `initTabs`/`setActiveTab`/`clearTabs` | **decoupled** — see §4.3              |
| `Layout/AppLayoutContent.tsx:50`            | `activeTabId` + pathname parsing      | `selectFocusedDocId(state)`           |
| `Layout/SideBar/PostItem.tsx:97,100,103`    | `rootId`/`activeTabId`/`dirtyTabIds`  | "open in any pane?" selector          |
| `Layout/SideBar/SubTabList.tsx:136,140`     | `setActiveTab`                        | `setActiveTab(paneId, tabId)`         |
| `Layout/RightRail/index.tsx:52`             | `activeTabId`                         | focused pane                          |
| `Layout/RightRail/RevisionsSection.tsx:34`  | `tabIds`                              | focused pane                          |
| `Layout/RightRail/PropertiesSection.tsx:61` | `tabIds`/`dirtyTabIds`                | focused pane + global dirty           |
| `EditDocument/hooks/useDirtyTracking.ts:38` | `markTabDirty`/`markTabClean`         | `markDocDirty(docId)` — unchanged API |
| `EditDocument/hooks/useSave.ts:101,150`     | `markTabClean`                        | same                                  |
| `EditDocument/hooks/usePostLoader.ts:104`   | `markTabDirty`/`markTabClean`         | same                                  |
| `store/index.ts:104`                        | `dirtyTabIds.length`                  | reads `ui.dirtyDocIds`                |

The three `useSave`/`useDirtyTracking`/`usePostLoader` hooks are the easy half —
they only ever act on a docId, so hoisting dirty state to `ui.dirtyDocIds`
leaves their call sites untouched.

---

## 3. The command registry

### 3.1 Why this is the centerpiece

The Copilot has **6 tools** (`copilotAgentTools.ts`): `list_documents`,
`search_documents`, `read_document`, `read_current_document`, `get_selection`,
`edit_document`, `write_document`, `create_document`. The app has roughly 40
actions. It cannot create a series, move a post, publish, reorder, fork, open
anything, or change the layout.

Closing that by hand-writing 34 more `tool()` declarations in
`api/copilot/route.ts` fails within a month: the tool list and the UI drift, and
nothing structurally prevents the drift.

**One registry, three front-ends.**

```ts
interface Command<P = void> {
  id: string; // "document.open"
  title: string;
  params: ZodSchema<P>; // → JSON Schema for the AI
  effect: "read" | "mutate";
  scopes?: ("workspace" | "document" | "series")[];
  available?(ctx: CommandContext): boolean;
  run(ctx: CommandContext, params: P): Promise<CommandResult>;
  preview?(ctx: CommandContext, params: P): Promise<ProposedChange>;
}
```

- **⌘K palette** enumerates the registry (it already has `{ id, label, run }` —
  add `params`/`effect`).
- **UI buttons** dispatch commands instead of calling thunks directly, so human
  and agent share one code path, one undo, one optimistic update.
- **AI tools are _generated_** from the registry via zod → JSON Schema.

The payoff: **you cannot ship a feature the AI can't call**, because the tool
surface is derived rather than maintained. And `effect: "mutate"` gives every
write a uniform preview/accept path — generalizing the ad-hoc proposal flow that
today exists only for the three write tools.

### 3.2 Never give the AI a `navigate(url)` tool

Entity-level commands only: `document.open`, `pane.split`, `series.open`. The
moment the model depends on URL shape, routing is frozen forever — and it would
get `/posts/[id]` wrong immediately, since that id is a _series_ id.

This is also what makes §4 safe: routes can be reorganized freely because
nothing above the registry knows they exist.

### 3.3 Initial command set

Extracted from the 28 `router.push` sites and the existing palette:

| Namespace   | Commands                                                                     |
| ----------- | ---------------------------------------------------------------------------- |
| `document.` | `open`, `create`, `fork`, `rename`, `delete`, `publish`, `move`, `duplicate` |
| `pane.`     | `split`, `close`, `focus`, `setMode`                                         |
| `series.`   | `open`, `create`, `rename`, `delete`, `addPost`, `reorder`                   |
| `editor.`   | `save`, `insertBlock`, `applyEdit`, `showDiff`                               |
| `ui.`       | `toggleSidebar`, `toggleCopilot`, `setTheme`                                 |

---

## 4. Route changes

### 4.1 Phases 1–3: no route changes at all

Worth stating loudly. The URL table stays byte-identical through Phase 3. What
changes is direction: `document.open(id)` mutates `ui.workspace` _and_ calls
`router.push` to keep the address bar honest. A cold-load deep link
(`/edit/abc`) resolves to a replayed `document.open("abc", { mode: "write" })`.

### 4.2 Phase 4: split the route group

Route groups are parenthesized, so **every URL is preserved**. This is a file
move plus an untangling.

**`(public)`** — anonymous, SSR, no store, no sidebar:

| Route        | Purpose                  |
| ------------ | ------------------------ |
| `/view/[id]` | canonical shareable post |
| `/user/[id]` | author profile           |
| `/privacy`   | static                   |

(`/embed/[id]` and `/offline` are already outside the group — leave them.)

**Corrected 31 Jul 2026.** This table originally also listed `/browse`,
`/browse/[id]` and `/tutorial` as public. All three actually landed in
`(workspace)`, and the discrepancy sat unnoticed under a "phase 4 done" mark.
The two are not the same mistake:

- **`/browse` belongs in `(workspace)` — the table was wrong.**
  `DocumentBrowser` reads `postsSelectors.selectAll` and `state.user`
  (`index.tsx:25-26`), and the store only ever holds the session's _own_ posts.
  So it is a private view of your own library, not discovery. Making it public
  would be a feature, not a file move. Listed under `(workspace)` below.
- **`/tutorial` is genuinely undecided, and is left in `(workspace)` for now.**
  Unlike `/browse` it would move cleanly: the page is a server component that
  reads the well-known `tutorial` document and renders stored revision HTML
  (`(workspace)/tutorial/page.tsx`), touching no session and no store. It is a
  candidate for `(public)` on the §8.1 reasoning — one render path, cacheable —
  but that is a product call about whether the tutorial is a marketing surface
  or an in-app help page, so it is recorded here rather than guessed at.

  > **Resolved 7 Aug 2026, by deletion.** The product call was made the other
  > way: `/tutorial` was the upstream fork's product tour, and it and
  > `/playground` were both removed rather than re-homed — see
  > [upstream-scrub.md](./upstream-scrub.md) phases 3–4. The route table below
  > still lists them; it describes the layout as designed here, not as it now
  > stands.

**`(workspace)`** — session required, five-column shell:

| Route                                 | Purpose                             |
| ------------------------------------- | ----------------------------------- |
| `/`                                   | home AI pane                        |
| `/edit/[[...id]]`                     | workspace, focused on a document    |
| `/new/[[...id]]`                      | create; the id is a **fork source** |
| `/posts/[[...id]]`                    | library, optionally series-scoped   |
| `/series/[id]/edit`                   | series settings                     |
| `/browse`, `/browse/[id]`             | your own library, searchable        |
| `/notes`, `/playground`, `/dashboard` | tools                               |
| `/tutorial`                           | help — see the note above           |

The win: `/view/[id]` stops booting a Redux store, a sidebar, and a Copilot
panel it never uses. That is the crawled, shared, cacheable surface.

### 4.3 The cost, stated precisely

`ViewDocument.tsx` is a client component that **drives the global tab slice**
(lines 82–103) and reads `activeTabId` (line 49). Splitting the groups means
resolving each of those into either:

- a prop passed down from the server page (most of them — the view route renders
  stored revision HTML and genuinely doesn't need a live editor's state), or
- a real workspace concern that moves to the workspace side.

**This is exactly why Phase 4 comes after Phase 2.** Once workspace state is
explicit, every remaining store read in `ViewDocument` is provably one or the
other. Today you cannot tell which, and doing the split first means doing it
blind.

### 4.4 Phase 5: view/edit stops being a route decision

`CommandPalette.tsx:200` — `router.push(`/${toRead ? "view" : "edit"}/${id}`)` —
is the line that dies. After:

- **Author toggling read mode** stays on `/edit/[id]` and flips `pane.mode`. No
  navigation, no second component tree, no remount, scroll preserved.
- **`/view/[id]` becomes purely public.** An author landing there from a shared
  link gets an "Open in workspace" affordance, not a silent redirect — so the
  URL keeps meaning "the published thing," which is what makes it safe to share.

With split view, the URL names the **focused** document only:
`/edit/<focused-id>`. Changing focus rewrites the segment; other panes live in
workspace state and survive reload.

### 4.5 What not to change

- **Keep `/edit` as the name.** Already an optional catch-all, already works.
  Renaming to `/w` breaks bookmarks to buy nothing. That "edit" now means
  "workspace focused here" is acceptable semantic drift.
- **Keep `/posts/[seriesId]`.** The name is off, but `/series/[id]` is already a
  308 `permanentRedirect` to it — this was decided. The AI never sees URLs.
- **Don't merge `/new` into `/edit`.** Fork-from-source is a distinct entry
  point with its own OG metadata.
- **Do not serialize the workspace into the URL** (`/w?panes=a:edit,b:view`). It
  buys shareable layouts nobody asked for, at the price of maintaining a second
  state format forever.

---

## 5. Split view

### 5.1 The singletons

| # | Singleton                                  | Problem with 2 panes                                                               | Fix                        |
| - | ------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------- |
| 1 | `ActiveEditorContext` — one `RefObject`    | `onEditorReady` fires on `isActive`; "active" must become **focused**, not visible | focus-driven; **keystone** |
| 2 | `ToolbarSlotContext` — one `slotEl` portal | two editors fight over the slot                                                    | one toolbar, follows focus |
| 3 | `ui.tabs` — one tab group                  | each pane needs its own                                                            | §2.3                       |
| 4 | `ui.diff.open` — global bool               | `showDiff && isActive` renders in both panes                                       | per-pane `diffOpen`        |
| 5 | `<title>` at `EditorTabPanel.tsx:163`      | two active panes emit two `<title>` tags                                           | focused pane only          |
| 6 | `copilotDocumentId` from pathname          | can't express "the left one"                                                       | `selectFocusedDocId`       |

**#1 is the keystone.** #2, #5, and #6 all fall out of it once "active" means
focused. Do it first and the rest are near-free.

### 5.2 The real trap: the same document in two panes

Two `EditorTabPanel`s for one docId produce two Lexical instances with
independent undo stacks and diverging content — and **both register into
`saveRegistry`, which is a `Map` keyed by docId, so the second registration
silently overwrites the first.** One pane's saves stop happening, with no error.

**Recommendation: forbid it.** `document.open(id)` focuses the existing pane if
the document is already open anywhere. Sharing one editor instance across two
views means building split-cursor semantics, which is not worth it here.

Guard it in the reducer, not just the command — a reducer invariant is the only
version an AI-issued command can't route around.

### 5.3 Scope

**Two panes, side by side. Not a recursive VS Code grid.** §5.1 costs the same
for 2 panes as for N, but arbitrary nested splits multiply the layout, resize,
and drag-drop surface for very little gain in an authoring tool.

### 5.4 Performance

Every mounted editor runs its full plugin set, and MathLive / Excalidraw /
Geogebra are heavy. You **already pay this** for hidden tabs, so split view adds
no new cost per document — but it invites users to open more.

Measure before optimizing. Note that suspending inactive panes conflicts
directly with preserving undo history, which is the documented reason
`display: none` was chosen over unmounting.

---

## 6. AI integration

### 6.1 What Phase 3 unlocks

Once tools are generated from the registry, the chatbox can do everything the
palette can — which is everything the UI can, since Phase 1 routed UI buttons
through the same registry. That is the AI-first jump, and it costs almost
nothing _after_ Phases 1–2.

### 6.2 Addressing

`read_document` takes `path` = `"<id>.md"`. With panes the model needs to say
"the document in the left pane" or "the one I just created." Stable pane ids
(§2.3) plus a `workspace.describe` read-command returning
`{ panes: [{ id, docId, title, mode, focused }] }` covers it.

Split view is where the Copilot gets genuinely more useful — "compare these two
drafts," "pull the intro from the left into the right."

### 6.3 Thread persistence — decide before Phase 3

~~The inline copilot thread is **ephemeral by design**.~~ **Corrected during
implementation:** the panel already persisted to `localStorage`. The real
defects were that storage is _per-browser_ rather than per-user, and does not
sync across devices. If the chatbox becomes the primary way to act, that thread
is the audit log and the undo trail, so it has to follow the user.

This is a schema decision. It is cheap now and expensive after users have
started relying on the thread as their history. **Phase 3 is the point of no
return** — that is when chat stops being an assistant and starts being an
interface.

> **DECIDED 31 Jul 2026: persist, per-user and per-workspace.** Threads survive
> reload and live alongside workspace state. Phase 3 must land the storage with
> the tool surface, not after it.

---

## 7. Implementation order

Phases 1–3 are **invisible to users**. That is what makes them safe, and it is
why they come first.

### Phase 1 — Command registry

Extract from `CommandPalette.tsx`; add `params` (zod) and `effect`. Route the 28
`router.push` sites through `document.open(id, { mode })` / `series.open(id)`.
Point UI buttons at commands rather than thunks.

_Acceptance:_ palette behaves identically; zero `router.push` outside the
registry; `npx tsc --noEmit` and `npm run lint` clean.

### Phase 2 — `ui.workspace`, one pane

Add `ui.workspace` (§2.3) with exactly one pane. Hoist dirty to
`ui.dirtyDocIds`. Migrate the 12 consumers (§2.4). **Delete the pathname parsing
at `AppLayoutContent.tsx:50-67`** and replace with `selectFocusedDocId`.

_Acceptance:_ no behavior change; nothing reads `usePathname()` to determine
what's open; `ui.tabs` is gone from the store.

### Phase 3 — Generate AI tools from the registry

zod → JSON Schema in `api/copilot/route.ts`. Uniform preview/accept for every
`effect: "mutate"` command. Add `workspace.describe`.

_Decide thread persistence first (§6.3)._

_Acceptance:_ the Copilot can perform any palette action; adding a command
requires no edit to the copilot route.

### Phase 4 — Split the route group

`(appLayout)` → `(public)` + `(workspace)`. Untangle `ViewDocument`'s store
reads (§4.3) using the now-explicit workspace boundary.

_Blocked on §8.1._

_Acceptance:_ every URL unchanged; `/view/[id]` renders with no store provider;
OG images and embed unaffected.

### Phase 5 — Two panes + in-place mode

Fix the six singletons (§5.1), starting with `ActiveEditorContext`. Guard
duplicate-open in the reducer (§5.2). `pane.mode` replaces the view/edit route
toggle. `EditorTabPanel`'s `display: none` becomes a pane grid.

_Acceptance:_ two documents editable side by side, independent undo; save
persists both; one toolbar following focus; a single `<title>`.

**Phases 1–3 deliver the AI-first goal. Phases 4–5 deliver split view.** They
share Phase 2 and are otherwise independent — if priorities shift after Phase 3,
either can be dropped without stranding the other.

---

## 8. Open questions — need a human decision

### 8.1 Does the public surface keep the app chrome?

Today `/view/[id]` renders inside the full five-column shell. After the split it
would render bare (with its own minimal header). **Is that the intent for a
signed-in author browsing their own published post?**

_Recommendation:_ yes, bare — with an "Open in workspace" button. It keeps the
public surface fast and makes the shared-link experience identical for everyone.
But this is a product call and it gates Phase 4.

> **DECIDED 31 Jul 2026: bare, with "Open in workspace".** No Redux store, no
> sidebar, no Copilot on the public surface. One render path for every visitor —
> a session-conditional shell would reintroduce exactly the ambiguity this plan
> exists to remove.

### 8.2 Should panes persist across sessions?

If a user closes the tab with two panes open, do they come back?
_Recommendation: yes, per-user in IndexedDB_ — it is what makes panes feel like
a workspace rather than a transient layout. Adds a hydration path to Phase 2
worth ~half a day.

> **DECIDED 31 Jul 2026: yes — IndexedDB, keyed per user, device-scoped.** The
> record is `{ panes, focusedPaneId, splitRatio }` in a `workspaces` store, id =
> the user's id or `"guest"`. Not the cloud: a split that fits a desktop does
> not fit a laptop, and a guest with no account still has documents and so still
> has a workspace. The split ratio moved out of `WorkspacePanes`' `useState` and
> into `ui.workspace` rather than getting a second storage path.
>
> Written by a debounced Redux middleware (`store/workspacePersistence.ts`),
> read back on entering the workspace, and gated on `ui.workspaceHydrated` —
> **not** `ui.initialized`, which is the end of a bootstrap that awaits the
> session, the posts and the series over the network. The seam then replays the
> URL through the ordinary `openPane`, so the reload case and the deep-link case
> are the Phase 5 reducer's decision and not a second code path's.
>
> A stored record is treated as untrusted (`lib/workspaceRestore.ts`): clamped
> to `MAX_PANES`, deduped so §5.2 survives a restore, focus re-pointed at a
> surviving pane, ratio clamped.

---

## 9. Risks

| Risk                                            | Mitigation                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `saveRegistry` key collision (§5.2)             | reducer-level duplicate-open guard, Phase 5                       |
| `ViewDocument` untangling is larger than scoped | Phase 2 first makes it measurable before starting                 |
| Registry becomes a god-object                   | namespace by entity; `effect` + `scopes` from day one             |
| "tab" drifts to mean "open document"            | §2.1 vocabulary table; call it out in review                      |
| AI issues commands faster than the UI settles   | commands return `CommandResult`; serialize mutations per document |

---

## 10. Test coverage

There is no automated coverage of any of this today, and the three existing
specs are pure-logic (`ordering`, `dragGeometry`, `legacyTypes`).

Two additions are worth making — both DOM-free, both matching the existing
convention of keeping logic in import-light modules precisely so it is testable:

- **Workspace reducers** (Phase 2): pane add/remove/focus, duplicate-open
  rejection, dirty hoisting. Pure reducer tests, `environment: "node"`.
- **Registry ↔ tool-schema parity** (Phase 3): every `effect: "mutate"` command
  has a `preview`; every command's zod schema converts to valid JSON Schema.
  This is the test that keeps §3.1's guarantee real.

API authorization remains manually verified per CLAUDE.md — none of this changes
that, since commands execute client-side and still land on the same authorized
routes.
