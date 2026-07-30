# Storage Model Simplification

Status: **proposal** — not yet implemented.
Date: 2026-07-28
Revised: 2026-07-28 — counts re-measured; precedence resolved to local-first;
outbox replaced with a dirty-set model after offline editing was confirmed as a
product requirement.

## 0. Criterion and verdict

The criterion for this work is **simplification of the codebase**, not feature
delivery. Judged on that:

| Change | Effect |
| --- | --- |
| Collapse the read model (`{local?, cloud?}` → one `doc`) | **Simplifies.** 47 dual-arm files → ~0; 25 duplicated precedence decisions → 1. |
| Make the local replica canonical, cloud the sync target | **Simplifies.** Deletes ~450 lines of reconciliation UI (§7.3). |
| Track sync state with `serverHead` | **Simplifies.** Replaces a 4-value enum *and* supplies conflict detection, which does not exist today. |
| A general operation-log outbox | **Does not simplify.** Not needed — see §4.2. Explicitly rejected. |
| Offline features (working-set sync, conflict UI, offline creates) | **Adds complexity.** Genuine feature work — fund it separately (§6 phase 3). |

The plan below is sequenced so that everything in the "simplifies" rows ships
before anything in the last row.

## 1. The problem

`UserDocument` models local and cloud as two **peer copies** of the same
document:

```ts
// src/types.ts:173
export type UserDocument = {
  id: string;
  local?: EditorDocument;
  cloud?: Document;
}; // Document can be local, cloud, or both
```

Because both arms are optional, every consumer must answer "which copy is the
real one?" for itself. Measured on the current tree (`da87f4c6`):

| Metric | Count |
| --- | --- |
| `.local` reads | 118 |
| `.cloud` reads | 118 |
| Files touching both | 47 |
| — of those, files re-deriving a precedence fallback | 20 |
| — of those, files using both arms for something else | 27 |
| Fallback **sites** | 25 |

Those 25 sites are the core cost. Each independently re-implements the same
precedence decision, and nothing enforces that they agree.

### 1.1 They already disagree — and the majority is wrong

The fallback sites do **not** share a precedence order. 20 of 25 read
`cloud || local`; only 5 read `local || cloud`.

**Cloud-first (20 sites, 15 files):**

```
3  src/components/Layout/SideBar/hooks/useSidebarActions.ts   :175, :464, :466
2  src/store/selectors/postsSelectors.ts                      :22, :55
2  src/components/Layout/SideBar/PostItem.tsx                 :113, :148
2  src/components/EditDocument/TabbedDocumentEditor.tsx       :74, :475
1  src/store/thunks/documentThunks.ts                         :420
1  src/store/selectors/layoutSelectors.ts                     :54
1  src/components/posts/components/PostsListView/components/PostRow.tsx  :79
1  src/components/posts/components/PostCompactListItem.tsx    :53
1  src/components/Layout/SideBar/SidebarSearchView.tsx        :37
1  src/components/Layout/SideBar/CollapsedRail.tsx            :128
1  src/components/Layout/SideBar/ActivePostsSection.tsx       :75
1  src/components/Home/RecentPostsPreviewCard.tsx             :86
1  src/components/Home/KanbanPreviewCard.tsx                  :162
1  src/components/Home/KanbanBoard.tsx                        :180
1  src/components/CommandPalette/CommandPalette.tsx           :180
```

**Local-first (5 sites, 5 files):**

```
1  src/components/DocumentActions/ActionMenu.tsx              :28
1  src/components/DocumentBrowser/hooks/useDocumentFiltering.ts  :18
1  src/components/DocumentCard/hooks/usePostState.ts          :42
1  src/components/DocumentControls/sortDocuments.ts           :43
1  src/components/posts/components/DocItem.tsx                :12
```

This split is observable today, not theoretical. `useLocalDraft.ts` writes
`data`, `head`, and `updatedAt` to the **local** arm only, so whenever a
signed-in user has an unsaved draft the two arms differ in content and
timestamp. Concretely: `sortDocuments.ts:43` sorts local-first while
`postsSelectors.ts:22` and `layoutSelectors.ts:54` sort cloud-first, so the
sidebar and the posts list already order the same documents by different
`updatedAt` values.

Given decision 1 (§3), the **20 cloud-first sites are the incorrect ones** — if
the local replica is what the user edits offline, reading the cloud arm shows
stale content. See §3.2.

## 2. What `local` is actually doing

It is not "guest storage". It carries four distinct responsibilities, three of
which apply to **signed-in** users:

| Job | Where | Signed-in? |
| --- | --- | --- |
| Guest persistence | `src/indexeddb/` (`documentDB`) | — |
| Unsaved-edit preservation on navigate-away | `src/components/EditDocument/hooks/useLocalDraft.ts` | yes |
| Dirty indicator (`local.head !== cloud.head`) | `src/components/shared/SyncToCloudFab.tsx:20` | yes |
| Draft-vs-published proxy (`isDraft = hasLocal && !hasCloud`) | `src/components/DocumentCard/hooks/usePostState.ts:33` | yes |

Consequence: naively deleting the local store for signed-in users would remove
offline editing, the dirty indicator, and the definition of "draft" — three
behaviours, not one code path.

### 2.1 IndexedDB is already a cache

```ts
// src/components/EditDocument/hooks/useDocumentLoader.ts:85
await dispatch(actions.createLocalDocument(cloudEditorDoc));
```

The editor **already** writes a local copy of every cloud document it opens.
The peer copy that exists for a signed-in user is, in the common case, not
something the user created — it is an artifact of the loader.

This materially reduces the scope of the work. The target architecture does not
need a cache to be built; one is already there. What is missing is that the
*type* still models two peers, so 47 files pay for an ambiguity the runtime has
largely already resolved. The job is to declare what is already true and delete
the code that pretends otherwise.

### 2.2 Local revisions are load-bearing

Local revision history is not only reconciliation scaffolding. Real features
read it:

- `src/components/Diff/index.tsx:16,29` — revision diffing
- `src/components/DocumentActions/Download.tsx:53` — export with history

Under decision 1 these must keep working offline, so **the local replica keeps
its `revisions[]`.** A thin `{ data, head, updatedAt }` draft overlay was
considered and rejected for this reason.

### Already cloud-only

`src/store/thunks/seriesThunks.ts` and `src/store/thunks/projectThunks.ts` have
**no** local variants (zero `Local` occurrences in either). Series and projects
are cloud-only today, so guests are already a documents-only tier. This is
ratified as intentional (see §3).

## 3. Decisions

| # | Question | Decision |
| --- | --- | --- |
| 1 | Must signed-in edits survive offline? | **Yes — full offline editing is a product requirement**, not merely unsaved-work preservation. See §3.1. |
| 2 | Guest local docs on sign-in? | **Push on sign-in, with consent.** Same mechanism as reconnect flush — see §3.3. |
| 3 | Guest capability scope? | **Scratchpad only** — documents, no series/projects. Matches today's reality; no new local schema. |
| 4 | Which arm wins when both exist? | **Local-first.** Resolved — see §3.2. |

### 3.1 Decision 1 is the constraint that shapes everything

Two different requirements were previously conflated:

- **Unsaved-work preservation** — don't lose edits when navigating edit→view.
  Served by `useLocalDraft.ts`, 68 lines, needs no second store.
- **Offline editing** — create and edit documents with no network.

The requirement is the second. That is what makes a durable local replica
necessary, and therefore what makes the read-model collapse (not the deletion
of local storage) the available simplification. It also means §6 phase 3 is
real feature work rather than cleanup, and should be resourced as such.

### 3.2 Precedence: local-first (resolved)

The local replica is what the user edits offline, so it is canonical; cloud is
the sync target. Reading the cloud arm for display would show stale content
whenever local is ahead.

This means **20 sites change behaviour** and 5 stay as they are — the more
invasive direction, chosen because the majority is wrong rather than right. The
step that migrates them must enumerate all 20 in its PR description.

Note this reverses an earlier draft of this document, which recommended
cloud-first on the assumption that local held only a transient draft.

### 3.3 Decision 2 is now mostly free

Earlier drafts specified a bulk "auto-upload all" migration and listed four
sub-problems: consent, idempotency, partial failure, and size bounds. Under the
`serverHead` model (§4.1), three of those disappear — a guest document is
simply one that has never had a `serverHead`, and signing in flushes it through
the *identical* code path used when a device reconnects. Idempotency and
resumability come from that mechanism, not from bespoke migration logic.

What remains, and must still be built:

- **Consent.** Guest documents are device-local by construction. On a shared or
  kiosk browser they may not belong to the person signing in; silently copying
  them into that account is a privacy change, not a migration detail. Minimum:
  a confirmation step, ideally per-document selection.

## 4. Target model

```ts
// replaces UserDocument = { local?, cloud? }
type UserDocument = {
  id: string;
  doc: EditorDocument;    // canonical, local, retains revisions[] (§2.2)
  serverHead?: string;    // last head the server confirmed
};
```

### 4.1 `serverHead` derives the sync state

An earlier draft carried `sync: "synced" | "pending" | "local-only" |
"conflict"` and an `origin: "cloud" | "local"` field. Both are dropped. One
nullable string derives everything they encoded:

| Condition | Meaning |
| --- | --- |
| `serverHead === doc.head` | synced |
| `serverHead !== doc.head` | dirty — push on reconnect |
| `serverHead` absent | never pushed (created offline, or a guest document) |
| server's head `!==` our `serverHead` | **conflict** — another device wrote |

`origin` was dropped because it is a function of the *session*, not of the
document: storing it per-document re-introduces exactly the denormalization
this proposal exists to remove — N documents each holding a copy of one session
bit, each able to go stale independently.

The last row is the significant one: this is ordinary optimistic concurrency,
and it supplies **conflict detection** — which §7.2 notes does not exist
anywhere today — for the cost of one field. Detection is the hard half;
resolution can stay deliberately dumb (last-write-wins on the server, both
revisions retained, existing FAB as the manual path).

A guest is not a separate tier under this model. It is a user whose documents
have no `serverHead`.

### 4.2 What is explicitly not being built: an outbox

Earlier drafts specified IndexedDB as "a cache plus an **outbox** of pending
writes." The outbox is rejected.

An outbox in the general sense — an ordered queue of operations with replay,
dedup, and retry semantics — solves a problem this application does not have.
**Document editing is state-based, not operation-based.** Three offline edits to
one document do not need to replay in order; the last state wins. There is
nothing to queue.

What is needed instead is a **dirty set**: the documents whose `doc.head` does
not match their `serverHead`. That is a derived selector over existing state,
not a new subsystem.

### 4.3 Call-site translation

| Today | After | Note |
| --- | --- | --- |
| `cloud \|\| local` (×20) / `local \|\| cloud` (×5) | `userDocument.doc` | Local-first; 20 sites change — §3.2 |
| `local.head !== cloud.head` (`SyncToCloudFab.tsx:20`) | `serverHead !== doc.head` | **Preserved** — see below |
| `isDraft = hasLocal && !hasCloud` | `!doc.published` | |
| `isPublished = hasCloud` | `doc.published` | |

The dirty indicator **survives** as a durable, user-visible state. This is a
change from an earlier draft, which routed writes through an outbox and reduced
dirtiness to a transient — silently deleting job #3 from §2's table. Under the
`serverHead` model the local replica stays ahead of the server until an
explicit or opportunistic push succeeds, so the standing "you have unsaved
work" signal is preserved rather than translated away.

## 5. Draft/published — smaller than expected

`published Boolean @default(false)` **already exists** on the Document model
(`prisma/schema.prisma:72`) and is indexed (`@@index([authorId, published])`,
`@@index([published, type])`). **No schema migration is required.**

Most of the UI already reads it correctly:

- `src/components/DocumentActions/hooks/useShareDocument.ts:181`
- `src/components/DocumentActions/hooks/useDocumentSubmit.ts:24`
- `src/components/Home/KanbanPreviewCard.tsx:13`

Only `usePostState.ts:33-34` uses the `hasCloud` proxy. That is **already a
bug** independent of this refactor: a cloud document with `published: false`
currently renders as published. Fixing it is a local change to one hook.

Note: `DocumentStatus` (`ACTIVE | DONE`, `src/types.ts:88`) is a *workflow*
state and is unrelated to publish state. Do not conflate the two.

## 6. Sequencing

Three phases. Phases 1–2 are the simplification and stand alone; phase 3 is
feature work that should only start once they land.

### Phase 1 — Standalone fixes and the read-model collapse

**1. Make cloud sync atomic.** Collapse `createCloudRevision` +
`updateCloudDocument` into a single endpoint (§7.1). Live bug, independent of
everything else, and the only server-side change. *More* urgent under decision
1, not less: it currently fires on an explicit FAB click, but will fire on every
reconnect.

**2. Fix `isDraft` / `isPublished`.** Point `usePostState.ts:33-34` at the
existing `published` field (§5). Standalone bug fix.

**3. Add the derived selector.** Compute `{ doc, serverHead }` from today's
`{ local, cloud }`. No behaviour change; validates the shape against real data
before anything is committed to.

**4. Migrate the 25 fallback sites to the selector.** Local-first per §3.2, so
20 sites change user-visible behaviour — enumerate them in the PR. The old
store shape still backs the selector, so this stays revertable.

Items 1 and 2 are independent of every decision in this document and can ship
immediately.

### Phase 2 — Make the local replica canonical

**5. Introduce `serverHead`; derive dirty and conflict from it.** Delete the
`sync` enum and `origin` concepts entirely.

**6. Delete the reconciliation components.** With one canonical copy, the
components in §7.3 that exist to reconcile two peers lose their reason to
exist: `Restore.tsx` (150 lines) and `DeleteBoth.tsx` (79) delete outright;
`Upload.tsx` (169) becomes "push a dirty document"; `SyncToCloudFab.tsx` (68)
becomes a `serverHead !== doc.head` check.

**7. Audit the remaining dual-arm files** (§7.3) and flip the store shape.
Change `src/store/app.ts` to store the new shape natively and delete
`local?`/`cloud?` from `types.ts:173`.

### Phase 3 — Offline features (adds complexity; fund separately)

**8. Client-generated IDs** so a document created offline keeps its identity
after it syncs.

**9. Working-set sync.** `useDocumentLoader.ts:85` caches a document only when
it is opened. Offline access to documents the user has not opened requires
syncing ahead of time, which needs a scope decision: all documents, the most
recent N, or explicitly pinned ones.

**10. Conflict UI.** Detection is nearly free (§4.1); presenting two divergent
versions to a user and asking them to choose is real design work.

## 7. Open risks

### 7.1 Non-atomic sync (now phase 1, item 1)

`syncLocalToCloud` (`src/store/thunks/documentThunks.ts:621`) performs two
sequential calls — `createCloudRevision`, then `updateCloudDocument` — with no
transaction. A failure between them leaves an orphaned revision and a stale
head.

Today this runs only on an explicit FAB click, so the window is rare. Under
offline sync it fires on every reconnect, so the failure becomes routine. This
is a real bug now and the only backend change in the plan — sequenced **first**
rather than as a prerequisite of the last step.

### 7.2 Conflict resolution (detection is solved; resolution is not)

There is no `"conflict"` path anywhere today, because peer-copies made
divergence the *user's* problem via the sync FAB. Offline editing on multiple
devices makes it the *system's* problem.

§4.1 supplies detection. Resolution still needs a policy; proposed minimum is
last-write-wins on the server with both revisions retained, and the FAB kept as
a manual escape hatch. The UI for this is phase 3, item 10.

### 7.3 Dual-arm consumers that the selector does not cover

47 files touch both arms; only 20 contain a precedence fallback. The other
**27 use both arms for genuinely different purposes** and will not be migrated
by phase 1. These are the substance of phase 2.

Highest-risk first — these exist specifically to reconcile the two peer copies:

- `src/components/DocumentActions/Restore.tsx` — `:26` early-returns unless
  *both* copies exist; unsatisfiable under the new model. **Delete.**
- `src/components/DocumentActions/Upload.tsx` — compares heads and revision
  sets. **Reduces to a push.**
- `src/components/DocumentActions/DeleteBoth.tsx` — deletes both copies.
  **Delete.**
- `src/components/shared/SyncToCloudFab.tsx` — the dirty indicator.
  **Reduces to a `serverHead` comparison.**
- `src/components/Home/TrashBin.tsx:62-67` — branches on `document.local` /
  `document.cloud`. **Single branch.**

The remaining 22, to be audited individually:

```
src/store/app.ts
src/editor/utils/virtualRepo.ts
src/lib/documentOrder.ts
src/utils/posts/seriesGrouping.ts
src/components/CopilotPanel/CopilotChat.tsx
src/components/CopilotPanel/CopilotPanel.tsx
src/components/DocumentActions/Fork.tsx
src/components/DocumentActions/hooks/useDocumentSubmit.ts
src/components/DocumentActions/hooks/useEditDocumentForm.ts
src/components/DocumentActions/hooks/useShareDocument.ts
src/components/DocumentCard/PostCard.tsx
src/components/DocumentCard/DraggablePostCard.tsx
src/components/DocumentCard/components/PostContent.tsx
src/components/EditDocument/DocumentHeader.tsx
src/components/EditDocument/SaveStateIndicator.tsx
src/components/Layout/EditorTopBar.tsx
src/components/Layout/RightRail/PropertiesSection.tsx
src/components/Layout/RightRail/RevisionsSection.tsx
src/components/Layout/SideBar/SeriesGroup.tsx
src/components/Layout/SideBar/hooks/useSidebarBulkActions.ts
src/components/posts/components/PostsCompactListView.tsx
src/components/posts/components/PostsListView/PostsListView.tsx
```

Note that `Diff/index.tsx` and `Download.tsx` are **not** on the migration list:
per §2.2 they keep reading local revisions, which remain the offline source of
history.

## 8. Non-goals

- Building local variants of series/projects (see decision 3).
- Building a general operation-log outbox (see §4.2).
- Changing the Lexical editor, revision format, or export/import.
- Reworking `src/indexeddb/idb.ts` internals (30 `any` usages) — a separate
  known cleanup, orthogonal to this proposal.
