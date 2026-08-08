# Scrubbing what the fork left behind

**Status:** COMPLETE, 7 Aug 2026 — all six phases landed, scope as locked in §2.
Follows the 30 Jul 2026 identity scrub, which handled _names_; this handled
_surface_. §3 records where this plan's own analysis was wrong and what
corrected it; §8 records what was never verified.

---

## 0. The thesis

`blog-simple` is a fork of `IBastawisi/math-editor`. The 30 Jul 2026 pass
scrubbed the inherited **identity** — package name, manifest, OG metadata,
Lexical namespaces, the previous owner's `ads.txt` / `assetlinks.json` / Play
Store graphic. What it did not touch is inherited **product surface**: routes,
demo content and plumbing that exist because upstream was a public multi-user
math-editor demo site, and that a single-author blog never uses.

The accepted goals are all four at once — less code to maintain, nothing
upstream-authored left, smaller repo, smaller attack surface. Where they
conflict, **provenance wins**: something upstream wrote and you never chose
goes, even when it is small.

The scope is deliberately narrow because the triage came back mostly negative.
Every editor node stays (§2), so the 22 MB `public/geogebra/` bundle stays with
`GraphNode` and the Excalidraw font families stay with `SketchNode`. What is
actually left is two demo routes, one orphan font, and the prose describing
them.

---

## 1. What the fork actually left

### 1.1 In scope

| Surface                                       | Size                     | Why it is upstream's, not yours                                        |
| --------------------------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| `/tutorial` + `public/data/tutorial.json`     | 476 KB + 268 LOC         | A product tour teaching _upstream's_ math editor, authored by upstream |
| `/playground` + `public/data/playground.json` | 280 KB + 44 LOC          | Upstream's "test drive the editor" demo doc                            |
| The app shell's second `ToolbarSlotProvider`  | ~10 LOC + 3 doc comments | Exists _only_ to serve those two routes                                |
| `public/fonts/Assistant/`                     | 80 KB, 4 files           | `@font-face` declared in `globals.css`, offered by nothing             |
| README / CLAUDE.md / `docs/` references       | prose                    | Describe the above as if they were features                            |

Neither route is reachable from the UI. `grep` finds no `href` to either one
anywhere in `src`. They are advertised to crawlers by `sitemap.ts` and named in
the Copilot deny-list, and that is the whole of their integration with the rest
of the app.

### 1.2 Explicitly out of scope

- **Every editor node stays** — Math, Graph, Sketch, Kanban, Sticky, Canvas,
  IFrame. Therefore `public/geogebra/` (22 MB), the Excalidraw font families and
  the MathLive/Excalidraw/GeoGebra dependencies all stay. This is the decision
  that makes the plan small.
- **The multi-user collaboration surface stays** — coauthors, forks,
  share-with-user, public `/user/[handle]` profiles. 29 files and a Prisma
  migration is too much blast radius for a fork you may want later.
  (`docs/plans/schema-organization.md` §5 already proposes dropping
  `DocumentCoauthors`; that is a separate decision, tracked there, not here.)
- **PWA / service worker / `/offline`**, **`/embed`**, **`/docx` + `/pdf`** —
  all stay. Considered and kept.
- **No database content is deleted.** Phase 0 _reads_ the database; no later
  phase writes to it.
- **Git history is not rewritten.** The 1,000 upstream commits stay. Every SHA
  keeps resolving, and the `docs/plans/` files that cite SHAs keep working.

---

## 2. Decisions locked

| Question              | Answer                                                                           |
| --------------------- | -------------------------------------------------------------------------------- |
| Goal                  | All four: maintenance, provenance, size, attack surface. Provenance breaks ties. |
| Tutorial & Playground | **Cut both**, route + component + data                                           |
| Editor nodes          | **Keep all**                                                                     |
| Collaboration surface | **Keep**, out of scope                                                           |
| Odds and ends         | Orphan font + untrack `claude_design/` only                                      |
| Git history           | **Untouched**                                                                    |
| DB content            | **Untouched**                                                                    |

---

## 3. Findings that change the plan

### 3.1 Both routes can serve a private draft to anonymous visitors

`src/app/(workspace)/playground/page.tsx` and its tutorial twin do this before
falling back to the static JSON:

```tsx
const document = await findDocument("playground");
if (!document) return <Playground />;
const html = await findRevisionHtml(document.head);
return <Playground>{htmr(html)}</Playground>;
```

`findDocument` (`src/repositories/document.ts:155`) is the **owner-scoped**
selector. It matches on id-or-handle and filters only `type: DOCUMENT` — there
is no `published` check and no `private` check, which is exactly the distinction
CLAUDE.md draws between `findSeriesById` and `findPublicSeriesById`. These are
unauthenticated server components calling it directly.

So any post whose handle is literally `playground` or `tutorial` — including an
unpublished private draft — renders its current head revision to anonymous
visitors at that URL.

This is narrow: it needs that exact handle, and it is plausible nothing in your
database has one. It is also the strongest argument for the cut, since deleting
the routes closes it outright with no authorization code to get right. **Phase 0
checks for those two handles before anything else happens.**

**Checked 7 Aug 2026: no such document exists, so this never fired.** It stays
documented because it is a _latent_ hole, not a fixed one — the routes still
contain the pattern, and any post that ever takes one of those handles trips it.
Deleting the routes is what closes it.

### 3.2 The font triage in my first pass was wrong — corrected here

I listed Assistant, Lilita, Nunito and Liberation as cuttable upstream
font-picker options. Only Assistant is.

`FONT_FAMILY_OPTIONS` (`ToolbarPlugin/Menus/FontSelect.tsx:141`) offers Roboto,
KaTeX, **Virgil**, **Cascadia**, Courier New, Georgia — so Virgil and Cascadia
are live. **ComicShanns, Excalifont, Lilita, Nunito and Liberation are
Excalidraw's own bundled families** (their content-hashed filenames are
Excalidraw's asset naming), and `SketchNode` stays, so they stay.

`Assistant` is the one removable copy: `@font-face` at `globals.css:371-374`,
referenced by no `font-family` rule and no component. 80 KB, not 608 KB.

**Corrected again during Phase 1 — it is not an orphan, it is a duplicate.**
`Assistant` is _Excalidraw's UI font_ (`--ui-font: Assistant, system-ui, …`,
`.ExcTextField__label{font-family:Assistant}`), and Excalidraw ships its own
four weights, declared against package-relative urls
(`./fonts/Assistant/Assistant-{Regular,Medium,SemiBold,Bold}.woff2`) that
webpack rewrites to `/_next/static/media/`. `Sketch/index.tsx:40` imports that
stylesheet. So the app had **two** copies: Excalidraw's complete bundled set,
and upstream's single-weight `public/fonts/` copy that only `globals.css`
pointed at. Removing the latter leaves Excalidraw's own faces untouched.

This distinction is the difference between a safe delete and a visible
regression in the Sketch dialog's chrome — worth stating so nobody later
"restores" the duplicate on seeing Excalidraw reference the family.

### 3.3 `showTutorialLink` is not a seam

`GraphDialog.tsx:46,84` is a GeoGebra applet parameter — it toggles a link to
_GeoGebra's_ tutorial. Unrelated to `/tutorial`. Leave it.

### 3.4 `ToolbarSlotContext` is not dead after the cut — its second provider is

The context has seven consumers, five of them workspace-side
(`WorkspaceToolbar`, `WorkspacePanes`, `TabbedDocumentEditor`, `AppLayout`,
`ToolbarPlugin`). The module stays.

What dies is the **app shell's** provider and target, which exist only for the
two routes that mount a lone editor. Once they are gone there is exactly one
provider in the tree, and the doc comment justifying two
(`ToolbarSlotContext.tsx:26-34`) becomes false rather than merely stale. That
comment collapsing is the real maintenance win here, not the 312 deleted lines.

---

## 4. Phases

Ordered by ascending blast radius. **Each phase is one commit and reverts
cleanly on its own**; no phase depends on a later one. Phases 1 and 2 can land
in any order relative to 3–5.

### Phase 0 — measure and check, no changes

Read-only. Produces the numbers the later phases are verified against, and the
one answer that could change the plan.

1. Query the database for the two reserved handles. **Handle only** — `id` is
   `uuid`, so an `id IN ('playground', 'tutorial')` arm is both a cast error and
   redundant, since `validate(handle)` gates that branch in `findDocument` and a
   non-UUID string never reaches it:
   ```sql
   SELECT id, handle, name, published, private, type, status, "authorId", head
   FROM "Document"
   WHERE lower(handle) IN ('playground', 'tutorial');
   ```
   - **No rows** (expected): §3.1 is theoretical, the routes have always served
     the static JSON, and Phases 3–4 delete pure upstream content.
   - **A row exists**: stop and decide. That document is being served publicly
     right now. It needs a new handle before the route is deleted, or you will
     404 a URL that was live.

   **RAN 7 Aug 2026 — zero rows, and zero near-misses on `handle ILIKE` /
   `name ILIKE '%playground%'` / `'%tutorial%'`.** Against the real database
   (`blog-dev` on the `postgres-blog` container, 206 documents / 1,362 revisions
   / 72 published), so the negative is meaningful. Decisive detail: **only 1 of
   206 documents has a handle at all** (`toolchain-upgrade`, unpublished) — the
   by-handle path is effectively unused in this data, so both routes have always
   fallen through to the static JSON. §3.1 never fired. Phases 3–4 are unblocked
   with no redirect and no handle rename.

   > **Do not run `docker compose up -d` to do this.** `postgres-blog`
   > (postgres:17.2) already holds 5432 — not this repo's `blog-postgres`
   > (postgres:16) — and composing up kills it. `.env` resolves `DATABASE_URL`
   > through `PGHOST`/`PGPORT`/`PGDATABASE`; query with
   > `docker exec postgres-blog psql -U postgres -d blog-dev`.
2. Record `du -sh public`, `du -sh .git`, and a production build's route list,
   so §6 has a before to compare against.
3. Run `npm run check:unused` (knip) and keep the output — Phases 3–5 will
   orphan modules (`htmr`, `findRevisionHtml`'s callers), and the diff between
   this run and the post-cut run is how you find them rather than guessing.

**Revert:** nothing to revert.

### Phase 1 — the duplicated font — **DONE 7 Aug 2026**

- Delete `public/fonts/Assistant/` (4 files, 80 KB).
- Delete the `@font-face` block at `src/app/globals.css:371-374`.

Verified before deleting:

- **Excalidraw keeps its own copy** — see §3.2. This was the one that could have
  bitten; the vendored-CSS grep the plan called for is what caught it.
- `grep -rn "Assistant" src` returns only `lastAssistantMessage…` /
  `lastAssistantId` in `CopilotChat.tsx` — unrelated identifiers.
- **Stored content does not use it.** Two revisions matched `%assistant%`, both
  the prose "IDE assistants, semantic navigation, context-aware completion" in
  one document; zero matched `%font-family%Assistant%`. No post loses styling.
- `public/sw.js` precaches `/fonts/Assistant/*`, but it and `workbox-*.js` are
  gitignored build output (`.gitignore:41,43`) — the stale entries regenerate on
  the next `npm run build`.

Checks: `tsc --noEmit` clean, `npm run lint` clean, `npm run check:theme` clean
(9 CSS files, no scheme-invariant colors).

**Revert:** `git revert`. No runtime state involved.

### Phase 2 — delete `claude_design/` — **DONE 7 Aug 2026**

Not upstream's — it is your own design scratch — but the handoffs are
superseded: every one of them has been absorbed into the code it informed
(`ThemeProvider`'s palette, `Composer`'s metrics, `toolbar.css`,
`theme/treeRow.ts`).

**Scoped up from "untrack" to "delete" on the author's call.** The plan
originally proposed `git rm --cached` plus a `.gitignore` entry, on the premise
that nothing read the directory. That premise was **wrong**, and the correction
is the useful part of this phase:

> `claude_design/` was cited in five places — `DESIGN.md:96` ("**is** the design
> reference"), `ThemeProvider.tsx:16`, `Composer.tsx:26`, `toolbar.css:2` and
> `ide-redesign.md:4`. Nothing _built_ from it, which is what the first check
> looked for; documentation depended on it, which is not the same question.
> CLAUDE.md makes DESIGN.md mandatory for UI work, so untracking would have left
> the required design doc pointing at a file no clone contains.

Two of those five were **already dangling** before this phase:
`claude_design/toolbar/Editor.html` was never tracked, and the IDE proposal zip
was gitignored (`.gitignore:55`). So the repo already shipped design citations a
fresh clone could not resolve — the deletion just made the rot legible.

What was done:

- `git rm -r claude_design/` — 14 tracked files, 2,506 lines + 4 binaries.
- Rewrote all five citations to state the design decision **without** naming a
  file that is not there. `DESIGN.md` §2 now names `ThemeProvider.tsx` as the
  palette reference, which is what it had actually been all along — the handoff
  was explicitly never imported.
- Dropped the two now-vestigial `.gitignore` entries.
- Six further files (228 KB) were untracked/gitignored and so **not recoverable
  from git history**; they were copied to the session scratchpad before
  `rm -rf`. Everything tracked is recoverable from history as normal.

Checks: `tsc` clean, `lint` clean, `check:theme` clean.

**Lesson worth keeping:** "no build step reads it" is not the same as "nothing
depends on it". Grep the docs, not just the config, before deleting a directory
— `DESIGN.md` and `CLAUDE.md` are load-bearing in this repo.

**Revert:** `git revert` restores the tracked files and the citations together.
The six untracked files are not in the commit and would have to come from the
scratchpad copy.

### Phase 3 — delete `/tutorial` — **DONE 7 Aug 2026**

Deleted:

- `src/app/(workspace)/tutorial/page.tsx`
- `src/components/Tutorial/` — **three** files, not the two this plan listed:
  `index.tsx`, `TutorialEditor.tsx` and `checkpoints.ts` (106 LOC of
  tour-progress predicates, imported only by `TutorialEditor`)
- `public/data/tutorial.json` (476 KB / 9,160 lines)

Edited:

- `src/app/sitemap.ts` — dropped the `/tutorial` entry
- `src/components/CopilotPanel/InlineCopilotBar.tsx` — dropped `"/tutorial"`
  from `EXCLUDED_ROUTES`
- The four comments naming "Playground **and Tutorial**" as a pair
  (`PaneSkeleton.tsx:32`, `EditDocument/index.tsx:57`,
  `AppLayoutContent.tsx:133`, `ToolbarSlotContext.tsx:29`) now name only
  Playground. Phase 5 retires them entirely, but deferring the edit would have
  put a comment naming a deleted route into history — each commit should stand
  on its own.

Net **−9,458 / +4** across 11 files.

Checks: `tsc` clean, `lint` clean, `npm test` 18 files / **357** tests. Nothing
newly orphaned — knip's one unused file is `DocumentActions/Fork.tsx`, part of
the untouched collab surface. `htmr` and `findRevisionHtml` stay live via
`/playground` until phase 4.

> Note: CLAUDE.md documents "355 assertions"; the suite is at 357. Pre-existing
> drift, unrelated to this phase — fold the correction into phase 6.

**Revert:** `git revert`. The route was unreachable from the UI, so nothing
links into it; the only external exposure was the sitemap, and a crawler holding
a cached `/tutorial` now gets `not-found.tsx`. If that matters, add a redirect
in `next.config.ts` — but for a route with no inbound links it is noise.

### Phase 4 — delete `/playground` — **DONE 7 Aug 2026**

**The precondition was cheaper than this plan assumed.** It called for
re-pointing the harness in its own commit _before_ the deletion, costing a
fixture post in the dev database. But the harness is not a script in this repo —
it is a **procedure**, recorded in the `verify-ui-in-browser` memory and
referenced from CLAUDE.md §Testing. Re-pointing it is a documentation edit with
no repo commit to order, so neither option (1) nor (2) was needed.

What replaces it: **the guest editor.** `src/middleware.ts` is a no-op and
`(workspace)/layout.tsx` has no auth gate, so an anonymous browser can reach
`/new`, create a local draft — `backendFor(user)` picks `localBackend`
(IndexedDB) with no session — and land on `/edit/<id>` with every node
registered. One more step than `/playground`, still no auth, and it exercises
the workspace chrome rather than the app shell, which is what actually ships.

> Inferred from the code, not exercised end-to-end. The memory says so too;
> whoever uses the harness next should confirm and correct it.

Deleted:

- `src/app/(workspace)/playground/page.tsx`
- `src/components/Playground/` (`index.tsx`, `PlaygroundEditor.tsx`)
- `public/data/playground.json` (280 KB / 3,778 lines) — and `public/data/` with
  it, now empty

Edited:

- `src/app/sitemap.ts` — dropped the `/playground` entry
- `src/components/CopilotPanel/InlineCopilotBar.tsx` — dropped `"/playground"`
- `src/lib/capabilities.ts:7` — a guest's surface no longer lists "the
  playground". **This plan never listed this file**; it turned up only on a
  final grep, which is the argument for re-grepping after every deletion rather
  than trusting the seam list written a day earlier.
- `CLAUDE.md:356` and `DESIGN.md:400` both named `Playground` as the standalone
  editor component. Fixed now rather than in phase 6 — CLAUDE.md loads into
  every session, so a stale line there misleads more than most prose.
- The four app-shell-toolbar comments no longer name any route.

Net **−3,859 / +11** across 13 files.

Checks: `tsc` clean, `lint` clean, `npm test` 18 files / 357 tests, knip
unchanged (`DocumentActions/Fork.tsx` only, as before).

**A prediction in §4 phase 5 was wrong, corrected here:** `htmr` does _not_ fall
out of `package.json`. It has six live callers — `Diff/index.tsx`,
`app/embed/[id]/page.tsx`, and the `StickyNode` / `GraphNode` / `ImageNode` /
`SketchNode` decorators. `findRevisionHtml` likewise keeps three (`embed`,
`(public)/view/[id]`, plus its own module). Nothing was orphaned by either
deletion.

**Left for phase 6, deliberately:** `docs/plans/workspace-panes.md` §513-541 and
`docs/reviews/code-review-2026-07.md` both discuss these routes. Both are dated
records of decisions taken at the time — rewriting them would falsify the
history. They should be _annotated_ as superseded, not edited.

**Revert:** `git revert`. The harness note in memory would need reverting by
hand, since it does not live in this repo.

### Phase 5 — collapse the plumbing the two routes were holding up — **DONE 7 Aug 2026**

Net **−459 / +36** across 7 files. Everything below happened as written, plus
one item the plan did not anticipate (the `EditorSkeleton` arm, item 6).

The runtime risk was real and was checked by hand, since types cannot see it:
`useToolbarSlot` throws outside a provider. The callers are `ToolbarPlugin`
(reached only via `Editor` ← `ConnectedEditor` ← `EditorTabPanel`) and
`ToolbarSlotTarget` (mounted at `WorkspaceToolbar:61` and
`TabbedDocumentEditor:462`). All three sit under `WorkspacePanes`, which wraps
**both** its split and unsplit branches in the provider — so removing the
shell's leaves every caller covered.

Nested editors are not a concern: `NestedEditor` renders `EditorPlugins`, which
carries `FloatingToolbarPlugin`, not `ToolbarPlugin`.

1. **`src/components/Layout/AppLayoutContent.tsx:131-138`** — the shell's
   `<ToolbarSlotTarget>` and the comment explaining it. With no lone-editor
   route left, nothing portals into it.
2. **`src/components/Layout/AppLayout.tsx`** — the shell's `ToolbarSlotProvider`
   wrapper, if the target above was its only consumer. **Verify before
   deleting**: `ToolbarPlugin` calls `useToolbarSlot()`, which _throws_ outside
   a provider, so any editor that mounts under the shell rather than the
   workspace still needs one. If such a route exists, keep the provider and
   delete only the target.
3. **`src/contexts/ToolbarSlotContext.tsx:26-34`** — rewrite the doc comment.
   Its whole rationale is "there is more than one provider"; if step 2 removes
   the second one, that paragraph is now wrong, and a wrong comment about why a
   component exists is worse than no comment.
4. **`src/components/EditDocument/PaneSkeleton.tsx:32`** and
   **`src/components/EditDocument/index.tsx:57`** — both explain a layout
   decision by contrast with "Playground and Tutorial". Re-word to state the
   rule directly rather than by reference to routes that no longer exist.
5. Re-run knip and diff against Phase 0's output. ~~Expect `htmr` to fall out of
   `package.json`~~ — it did not, see phase 4. knip is unchanged throughout:
   `DocumentActions/Fork.tsx` before and after.
6. **Not in the original plan — `EditDocument`'s second Suspense arm.** It
   swapped in `shared/EditorSkeleton` when `children` were SSR'd content in an
   app-shell toolbar layout. `EditDocument` has exactly one mount —
   `edit/layout.tsx:27`, which renders it **bare** — so the arm was unreachable,
   and `children` was never anything. Removing it deletes
   `shared/EditorSkeleton.tsx` (**409 lines**) and leaves `PaneSkeleton` as the
   app's only editor stand-in. `EditDocumentContent` also declared
   `PropsWithChildren` without using it.

   This is the largest single deletion of the phase and the plan missed it
   entirely, because it looked for _routes_ that used the shell toolbar layout
   and this was a _fallback_ shaped for one.

**Revert:** `git revert` restores the plumbing, but the routes stay gone — which
is fine, the plumbing is inert without them.

---

### A correction to §3.1, found while reading the deleted code

Phase 4's inspection of the two deleted editors showed both took `children` and
**threw them away**:

```tsx
const PlaygroundEditor: React.FC<PropsWithChildren> = ({ children: _children }) => { … }
```

Each route did `findDocument(…)` → `findRevisionHtml` → `htmr(html)` and passed
the result down to a component that never rendered it. So §3.1 overstated the
symptom: a private draft holding one of those handles would **not have been
painted on the page**. Because `children` crossed a server→client boundary it
would still have been serialized into the RSC flight payload, and so been
retrievable from the page source — a real disclosure, but not a visible one.

The conclusion is unchanged (Phase 0 found no such document, and the routes are
gone), but the original wording claimed more than the code did.

### Phase 6 — the prose — **DONE 7 Aug 2026**

Last, so it describes the end state rather than an intention.

Two were **live rules pointing at deleted code**, which is the category that
actually matters — the rest is bookkeeping:

- `DESIGN.md:412` told every reader to "use `EditorSkeleton` for editor-area
  skeletons". Now names `EditDocument/PaneSkeleton`.
- `CLAUDE.md:61` said "eighteen specs, **355 assertions**". The suite reports
  357 tests; the file has 632 `expect()` calls and 347 literal `it`/`test`
  blocks (the gap is generated cases). "355" matched no metric — it was the
  vitest count when written, since drifted. Now reads "eighteen specs, 357
  tests", which is unambiguous about which number it is.

Historical records were **annotated, never rewritten** — `docs/README.md` says a
review body describes the code as it was on the date at its top, and editing one
would falsify that:

- `docs/reviews/code-review-2026-07.md` §3 got a second dated `STATUS` line, per
  the file's own per-finding convention. The finding is unchanged — the sinks
  and both delivery paths are untouched — but two route lists inside it are
  stale.
- `docs/plans/workspace-panes.md` §8.2 left `/tutorial` as an open product call
  ("marketing surface or in-app help page"). Annotated as resolved by deletion.
- `docs/plans/bloat-remediation.md` Step 5 said `EditorSkeleton` would stay,
  being a genuinely different shape. Annotated: it went anyway, as a side effect
  rather than a refutation.

`README.md` needed nothing — every feature it advertises (Math, Graph, Sketch,
Sticky notes, series) is still shipped, because no editor node was in scope.
`docs/README.md` links nothing that was deleted.

Memory updated: `verify-ui-in-browser` (the harness target, phase 4) and
`matheditor-fork-remnants` (this scrub, its locked scope, and the three traps
worth carrying forward).

- **`README.md`** — the Features list is still upstream's framing. Since every
  node stays it is not _wrong_, but check it claims nothing the app no longer
  does.
- **`CLAUDE.md`** — "Component Organization" lists
  `**Playground**: Standalone
  editor component`. Remove it. Check the Testing
  section too, which documents the `verify-ui-in-browser` harness and its
  `:3000` trap.
- **`docs/plans/README.md`** — add this plan's row.
- **`docs/README.md`** — check the index for links into anything deleted.
- **Your memory files** — `verify-ui-in-browser.md` names `/playground` as the
  harness target, and `matheditor-fork-remnants.md` should record that this
  second scrub happened and what it deliberately left (§1.2). Stale memory that
  names a deleted route is worse than none.

---

## 5. What this does not fix

Worth stating so the plan is not mistaken for a full de-fork:

- **1,000 upstream commits remain**, and the MIT `LICENSE` keeps
  `Copyright (c) 2022 Ibrahim El-bastawisi` — required, never delete it. It
  still has no second copyright line for you; adding one is a one-line change
  this plan does not schedule.
- ~~**`src/indexeddb/index.ts` keeps `databaseName: "matheditor"`** — renaming
  it strands every guest's local drafts.~~ **Overtaken 1 Aug 2026** by
  `7921af36`, which renamed it to `blog-simple` and added the copy that makes
  the rename safe. The reasoning above was right about the danger and wrong that
  it was unavoidable. Retiring the copy itself is
  `docs/plans/legacy-idb-retirement.md`; the background stays in
  `docs/guides/notes-indexeddb-origins.md`.
- **~9.5k LOC of `src/editor` is vendored Lexical playground code** (Meta
  copyright header). It is upstream-authored in the strictest sense, but it is
  the editor, not demo content. Out of scope.
- **The four PWA icons are still 24×24 placeholders.** A real bug, unrelated to
  provenance; not scheduled here.
- **`fix.diff` at the repo root** is gitignored, so it is local clutter only.

---

## 6. Acceptance

Per phase: `npx tsc --noEmit` and `npm run lint`. After Phase 5 also
`npm run check:theme` (the deleted layout touched shell chrome) and
`npm run check:nodes` is unnecessary — no node classes are touched by any phase.
`npm test` should stay at eighteen specs / 355 assertions throughout; no spec
covers any of this, which is itself worth noticing.

End state, measured 7 Aug 2026 (`git diff --shortstat 701498ed HEAD`):

|                                    | Before                     | After                                        |
| ---------------------------------- | -------------------------- | -------------------------------------------- |
| Whole scrub                        | —                          | **47 files, +580 / −16,292**                 |
| `public/` demo data                | 756 KB                     | 0 — `public/data/` deleted                   |
| `public/fonts/`                    | 608 KB                     | 524 KB                                       |
| `public/` total                    | ~41.8 MB                   | 41 MB (`geogebra` is 22 MB of it, kept)      |
| Deleted app code                   | —                          | ~740 LOC (`EditorSkeleton` 409 is over half) |
| Public routes                      | `/tutorial`, `/playground` | neither                                      |
| `ToolbarSlotProvider`s in the tree | 2                          | 1                                            |
| Editor skeleton components         | 2                          | 1                                            |
| Tracked binary blobs               | 4                          | 0                                            |

**One row of this table was wrong when written, and is corrected rather than
quietly dropped:** it claimed unauthenticated `findDocument` callers would go "2
→ 0". Six page-level callers remain (`docx`, `pdf`, `embed`, `(public)/view`,
`(workspace)/edit`, `(workspace)/new`). The honest metric is _callers that
perform no visibility check at all_, which did go **2 → 0** — `view/[id]` and
`embed/[id]` both test `document.private` by hand, which is precisely what
`/playground` and `/tutorial` never did. Hand-checking is still the pattern
CLAUDE.md warns about and the July review's §1 tracks as OPEN; it is simply not
the same defect.

The bundle win is small and always was — `public/geogebra` is 22 MB and stays.
The provenance and attack-surface wins are the point.

## 8. What was never verified

No phase was exercised in a browser, per the working agreement that `tsc` and
lint are the gate. Every phase passed `tsc`, `lint`, `check:theme` and the 357
tests, and none of that can prove a React context is reachable at runtime —
phase 5's provider removal is the change where that gap is real, and it was
closed by hand-tracing every `useToolbarSlot` caller rather than by a tool. A
`npm run build` plus one load of `/edit` would close it properly.

The guest-editor replacement for the browser harness (phase 4) is likewise
inferred from `backendFor`, the no-op middleware and the ungated workspace
layout — not run.

---

## 7. Open questions

1. ~~**Phase 0's query**~~ — **resolved 7 Aug 2026.** Zero rows; Phases 3–4 are
   plain deletions. See §4 Phase 0.
2. **Harness re-point (Phase 4)** — option (1) needs a fixture post in the dev
   database that the procedure can rely on. Which post, and does it get created
   by a seed script or by hand?
3. **A second `User` row exists** — `Copilot Test`, 0 documents, alongside
   `lomes0` at 206. Nothing here depends on it, and the collab surface is out of
   scope (§1.2) — but "sole author" is true of the content, not of the `User`
   table, which is worth knowing if `schema-organization.md` §5's
   `DocumentCoauthors` drop is ever picked up.
4. **`claude_design/` in history** — Phase 2 untracks it going forward. Leaving
   it in history is consistent with §1.2, but it is your file, so it is a
   different call than the upstream-commit one.
