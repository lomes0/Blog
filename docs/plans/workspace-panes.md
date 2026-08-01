# Workspace panes, routing, and the AI command surface

**Status: written plan only. No code changed.** Supersedes nothing; sits
alongside [ide-redesign.md](./ide-redesign.md), which proposed converging the
app on an IDE shell. That convergence is now ~done at the *chrome* level. This
plan is about the layer underneath it: what "open" means, and who is allowed to
say it.

Two open product questions are in §8. Phase 1 is unblocked today; Phase 4 is
blocked on §8.1.

---

## 0. The thesis

Three complaints motivated this: the hard view/edit separation, one document at
a time, and wanting an AI that can do anything a user can. They have one root
cause.

> **There is no first-class answer to "what is open."** The URL is the answer,
> and it can only hold one document, so the app can only hold one document —
> and the AI can only see what it can parse out of a path string.

Two consequences worth naming up front:

**The seam is in the wrong place.** Today it is drawn at `view │ edit`. It
belongs at `public │ workspace`. `/view/[id]` for an anonymous reader is a
genuinely different application — SSR, cacheable, no store, no sidebar.
`/view/[id]` for the document's own author is a *mode toggle* that currently
costs a full navigation and a second component tree (`ViewDocument` 242L vs
`TabbedDocumentEditor` 454L).

**The data flow is backwards.** `AppLayoutContent.tsx:50-67` calls
`usePathname()`, splits segments, and derives which document the Copilot is
talking about — with a rule that view routes are authoritative and edit routes
follow `activeTabId`. That code exists *only* because workspace state is not
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

Every open document is *already in the DOM*. Split view stops hiding them.

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
registry is an *extraction*, not a greenfield build.

### 1.4 The view/edit split is already fake at the state layer

`ViewDocument.tsx` dispatches `initTabs`, `setActiveTab`, and `clearTabs`
(lines 82–103) — the *same global slice* the editor drives. The two routes
already share the state; they just don't share the seam. This both proves the
split is artificial and explains why Phase 4 has to come after Phase 2.

---

## 2. `ui.tabs` → `ui.workspace`

### 2.1 The name collision, first

`tabs` is **already taken** and means something else: the child documents of one
post (`mergePostsIntoTabs` in `postThunks.ts:220`, `tabLabel` in the Prisma
schema, `parentId` nesting). That is a *content model*, not a workspace model.

**Vocabulary decision — apply from Phase 2 onward:**

| Term      | Means                                          | Lives in           |
| --------- | ---------------------------------------------- | ------------------ |
| **pane**  | A viewport onto a document. New.               | `ui.workspace`     |
| **tab**   | A child document of a post. Unchanged.         | `Document.parentId`|

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

| File                                       | Reads/Writes                        | Becomes                              |
| ------------------------------------------ | ----------------------------------- | ------------------------------------ |
| `EditDocument/TabbedDocumentEditor.tsx`     | all 8 reducers, `state.ui.tabs`     | scoped to its own pane id            |
| `views/ViewDocument.tsx:49,82,86,98,103`    | `initTabs`/`setActiveTab`/`clearTabs`| **decoupled** — see §4.3             |
| `Layout/AppLayoutContent.tsx:50`            | `activeTabId` + pathname parsing    | `selectFocusedDocId(state)`          |
| `Layout/SideBar/PostItem.tsx:97,100,103`    | `rootId`/`activeTabId`/`dirtyTabIds`| "open in any pane?" selector         |
| `Layout/SideBar/SubTabList.tsx:136,140`     | `setActiveTab`                      | `setActiveTab(paneId, tabId)`        |
| `Layout/RightRail/index.tsx:52`             | `activeTabId`                       | focused pane                         |
| `Layout/RightRail/RevisionsSection.tsx:34`  | `tabIds`                            | focused pane                         |
| `Layout/RightRail/PropertiesSection.tsx:61` | `tabIds`/`dirtyTabIds`              | focused pane + global dirty          |
| `EditDocument/hooks/useDirtyTracking.ts:38` | `markTabDirty`/`markTabClean`       | `markDocDirty(docId)` — unchanged API|
| `EditDocument/hooks/useSave.ts:101,150`     | `markTabClean`                      | same                                 |
| `EditDocument/hooks/usePostLoader.ts:104`   | `markTabDirty`/`markTabClean`       | same                                 |
| `store/index.ts:104`                        | `dirtyTabIds.length`                | reads `ui.dirtyDocIds`               |

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
  id: string;                        // "document.open"
  title: string;
  params: ZodSchema<P>;              // → JSON Schema for the AI
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
- **AI tools are *generated*** from the registry via zod → JSON Schema.

The payoff: **you cannot ship a feature the AI can't call**, because the tool
surface is derived rather than maintained. And `effect: "mutate"` gives every
write a uniform preview/accept path — generalizing the ad-hoc proposal flow that
today exists only for the three write tools.

### 3.2 Never give the AI a `navigate(url)` tool

Entity-level commands only: `document.open`, `pane.split`, `series.open`. The
moment the model depends on URL shape, routing is frozen forever — and it would
get `/posts/[id]` wrong immediately, since that id is a *series* id.

This is also what makes §4 safe: routes can be reorganized freely because
nothing above the registry knows they exist.

### 3.3 Initial command set

Extracted from the 28 `router.push` sites and the existing palette:

| Namespace   | Commands                                                              |
| ----------- | --------------------------------------------------------------------- |
| `document.` | `open`, `create`, `fork`, `rename`, `delete`, `publish`, `move`, `duplicate` |
| `pane.`     | `split`, `close`, `focus`, `setMode`                                  |
| `series.`   | `open`, `create`, `rename`, `delete`, `addPost`, `reorder`            |
| `editor.`   | `save`, `insertBlock`, `applyEdit`, `showDiff`                        |
| `ui.`       | `toggleSidebar`, `toggleCopilot`, `setTheme`                          |

---

## 4. Route changes

### 4.1 Phases 1–3: no route changes at all

Worth stating loudly. The URL table stays byte-identical through Phase 3. What
changes is direction: `document.open(id)` mutates `ui.workspace` *and* calls
`router.push` to keep the address bar honest. A cold-load deep link
(`/edit/abc`) resolves to a replayed `document.open("abc", { mode: "write" })`.

### 4.2 Phase 4: split the route group

Route groups are parenthesized, so **every URL is preserved**. This is a file
move plus an untangling.

**`(public)`** — anonymous, SSR, no store, no sidebar:

| Route                    | Purpose                    |
| ------------------------ | -------------------------- |
| `/view/[id]`             | canonical shareable post   |
| `/browse`, `/browse/[id]`| discovery                  |
| `/user/[id]`             | author profile             |
| `/privacy`, `/tutorial`  | static                     |

(`/embed/[id]` and `/offline` are already outside the group — leave them.)

**`(workspace)`** — session required, five-column shell:

| Route                | Purpose                            |
| -------------------- | ---------------------------------- |
| `/`                  | home AI pane                       |
| `/edit/[[...id]]`    | workspace, focused on a document   |
| `/new/[[...id]]`     | create; the id is a **fork source**|
| `/posts/[[...id]]`   | library, optionally series-scoped  |
| `/series/[id]/edit`  | series settings                    |
| `/notes`, `/playground`, `/dashboard` | tools             |

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

- **Author toggling read mode** stays on `/edit/[id]` and flips
  `pane.mode`. No navigation, no second component tree, no remount, scroll
  preserved.
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
- **Do not serialize the workspace into the URL** (`/w?panes=a:edit,b:view`).
  It buys shareable layouts nobody asked for, at the price of maintaining a
  second state format forever.

---

## 5. Split view

### 5.1 The singletons

| # | Singleton                                  | Problem with 2 panes                        | Fix                              |
| - | ------------------------------------------ | ------------------------------------------- | -------------------------------- |
| 1 | `ActiveEditorContext` — one `RefObject`    | `onEditorReady` fires on `isActive`; "active" must become **focused**, not visible | focus-driven; **keystone** |
| 2 | `ToolbarSlotContext` — one `slotEl` portal | two editors fight over the slot             | one toolbar, follows focus       |
| 3 | `ui.tabs` — one tab group                  | each pane needs its own                     | §2.3                             |
| 4 | `ui.diff.open` — global bool               | `showDiff && isActive` renders in both panes| per-pane `diffOpen`              |
| 5 | `<title>` at `EditorTabPanel.tsx:163`      | two active panes emit two `<title>` tags    | focused pane only                |
| 6 | `copilotDocumentId` from pathname          | can't express "the left one"                | `selectFocusedDocId`             |

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
nothing *after* Phases 1–2.

### 6.2 Addressing

`read_document` takes `path` = `"<id>.md"`. With panes the model needs to say
"the document in the left pane" or "the one I just created." Stable pane ids
(§2.3) plus a `workspace.describe` read-command returning
`{ panes: [{ id, docId, title, mode, focused }] }` covers it.

Split view is where the Copilot gets genuinely more useful — "compare these two
drafts," "pull the intro from the left into the right."

### 6.3 Thread persistence — decide before Phase 3

The inline copilot thread is **ephemeral by design**
(`CopilotPanel/copilotStorage.ts`). If the chatbox becomes the primary way to
act, that thread is the audit log and the undo trail. It needs to be persisted,
per-user and per-workspace.

This is a schema decision. It is cheap now and expensive after users have
started relying on the thread as their history. **Phase 3 is the point of no
return** — that is when chat stops being an assistant and starts being an
interface.

---

## 7. Implementation order

Phases 1–3 are **invisible to users**. That is what makes them safe, and it is
why they come first.

### Phase 1 — Command registry

Extract from `CommandPalette.tsx`; add `params` (zod) and `effect`. Route the 28
`router.push` sites through `document.open(id, { mode })` / `series.open(id)`.
Point UI buttons at commands rather than thunks.

*Acceptance:* palette behaves identically; zero `router.push` outside the
registry; `npx tsc --noEmit` and `npm run lint` clean.

### Phase 2 — `ui.workspace`, one pane

Add `ui.workspace` (§2.3) with exactly one pane. Hoist dirty to
`ui.dirtyDocIds`. Migrate the 12 consumers (§2.4). **Delete the pathname parsing
at `AppLayoutContent.tsx:50-67`** and replace with `selectFocusedDocId`.

*Acceptance:* no behavior change; nothing reads `usePathname()` to determine
what's open; `ui.tabs` is gone from the store.

### Phase 3 — Generate AI tools from the registry

zod → JSON Schema in `api/copilot/route.ts`. Uniform preview/accept for every
`effect: "mutate"` command. Add `workspace.describe`.

*Decide thread persistence first (§6.3).*

*Acceptance:* the Copilot can perform any palette action; adding a command
requires no edit to the copilot route.

### Phase 4 — Split the route group

`(appLayout)` → `(public)` + `(workspace)`. Untangle `ViewDocument`'s store
reads (§4.3) using the now-explicit workspace boundary.

*Blocked on §8.1.*

*Acceptance:* every URL unchanged; `/view/[id]` renders with no store provider;
OG images and embed unaffected.

### Phase 5 — Two panes + in-place mode

Fix the six singletons (§5.1), starting with `ActiveEditorContext`. Guard
duplicate-open in the reducer (§5.2). `pane.mode` replaces the view/edit route
toggle. `EditorTabPanel`'s `display: none` becomes a pane grid.

*Acceptance:* two documents editable side by side, independent undo; save
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

*Recommendation:* yes, bare — with an "Open in workspace" button. It keeps the
public surface fast and makes the shared-link experience identical for everyone.
But this is a product call and it gates Phase 4.

### 8.2 Should panes persist across sessions?

If a user closes the tab with two panes open, do they come back? *Recommendation:
yes, per-user in IndexedDB* — it is what makes panes feel like a workspace rather
than a transient layout. Adds a hydration path to Phase 2 worth ~half a day.

---

## 9. Risks

| Risk                                           | Mitigation                                       |
| ---------------------------------------------- | ------------------------------------------------ |
| `saveRegistry` key collision (§5.2)            | reducer-level duplicate-open guard, Phase 5      |
| `ViewDocument` untangling is larger than scoped| Phase 2 first makes it measurable before starting|
| Registry becomes a god-object                  | namespace by entity; `effect` + `scopes` from day one |
| "tab" drifts to mean "open document"           | §2.1 vocabulary table; call it out in review     |
| AI issues commands faster than the UI settles  | commands return `CommandResult`; serialize mutations per document |

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
