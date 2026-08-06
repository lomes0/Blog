# Gating agent changes

**Status: proposal (2026-08-06), decisions locked — not started.** Builds
directly on the content bridge
([claude-code-lexical.md](./claude-code-lexical.md), phases 1–5 shipped) and on
the `head` compare-and-set that landed in `fd67510e`. The eight decisions §8
used to leave open were taken on 6 Aug 2026 and are folded into the design
below.

Claude Code writes to the blog from the terminal, out of band, and the change is
live the moment it lands. This plan makes an agent write **proposed** rather
than committed: it goes to storage, it is visible in the app, and it becomes the
document only when you approve it.

## 1. The insight

`Document.head` is a pointer, and an agent write already creates a `Revision`
row. The write and the commit are therefore **already two operations** — gating
is a matter of not doing the second one.

```
today     apply_ops ──► INSERT Revision ──► head = revision.id       live at once
                                            (CAS on expected head)

gated     apply_ops ──► UPSERT Revision ──► head unchanged           proposed
                        proposedAt set        │
                                              ├─► approve: head = revision.id  (same CAS)
                                              └─► reject:  delete the row
```

Approval is a one-row pointer move. Rejection costs nothing, because the
proposal was never reachable. **Nothing in `src/lib/content-bridge/` changes** —
not addressing, not the codecs, not `stateHash`. This is a plan about _where the
pointer points_, and everything expensive was built already.

## 2. What already exists

Measured against the tree at `05ba3a0d`.

| Asset                           | Where                                                             | What it gives us                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full-state revisions            | `Revision.data`                                                   | The proposal payload, already stored per write                                                                                                                        |
| Conditional head write          | `updateDocument(…, expectedHead)`, `repositories/document.ts`     | Approval that cannot clobber a concurrent save                                                                                                                        |
| Revision diff view              | `components/Diff/index.tsx`                                       | `generateHtml` both sides + `HtmlDiff.execute`. Compares **any two revision ids** — this is the review UI, near enough, once its fallback branch stops writing (§2.1) |
| Diff wiring                     | `setDiffRevisions` / per-pane `diffOpen` (`store/app.ts:310,543`) | "Review" = two dispatches                                                                                                                                             |
| A rail to hang it on            | `Layout/RightRail/RevisionsSection.tsx`                           | A sibling `ProposalsSection` is ~an afternoon                                                                                                                         |
| Revision fetch                  | `GET /api/revisions/[id]`                                         | Loading a proposal's content client-side                                                                                                                              |
| Conflict handling in the editor | `useSave.ts`, `pendingSaves.ts`                                   | A tab that loses a race already stops, buffers and recovers                                                                                                           |
| Persistent block ids            | `content-bridge/blockId.ts`                                       | What would make rebasing and per-block approval possible later                                                                                                        |

### 2.1 Five gotchas, all findable only by reading

**The client never sees a non-head revision — except on a collab document.**
`toCloudDocument` (`repositories/document.ts:99`) does

```ts
const revisions = post.collab
  ? post.revisions
  : post.revisions.filter((r) => r.id === post.head);
```

and `revisionsSelect` is `take: 1` besides. On the ordinary branch a proposal is
invisible **by construction** — the one row fetched _is_ the proposal, the
filter then drops it, and `post.revisions` arrives empty, taking head's own
metadata with it. On the `collab` branch nothing filters, so the proposal
arrives dressed as history. `collab` is reachable — `useDocumentSubmit.ts:41`
toggles it — so this is not a theoretical branch.

Both follow from putting the `proposedAt: null` filter in the wrong place: it
belongs in `revisionsSelect`, where it covers every caller, and not in the
non-collab arm of `toCloudDocument`. Surfacing proposals then needs a deliberate
change here or its own fetch; phase 4 owns that half.

**`findDocument` repairs `head` by writing, and would promote a proposal.**
`repositories/document.ts:209-216`:

```ts
if (!revision && !revisions) {
  // head is null or points to a revision not in the list — recover from latest
  revision = cloudDoc.revisions[0];   // newest first
  await prisma.document.update({
    where: { id: doc.id },
    data: { head: revision.id },
  });
```

`DELETE /api/revisions/[id]` lets a revision's own author delete it and
`deleteRevision` does not touch `head`, so head's row can vanish — and the next
read then repairs `head` to the newest revision, which under gating is the
pending proposal. No CAS, no user action, and the partial unique index does not
help: it constrains `proposedAt`, not `head`, so the result is `head` pointing
at a row still marked pending, which `toCloudDocument` will happily serve.

This is the one place that promotes a revision to head without going through
§3.4, and it is a _write_, so the phase-1 sweep for history reads will not find
it. The repair must pick `revisions.find((r) => !r.proposedAt)`.

**A revision on a published post is world-readable.**
`requireRevision(id, user,
"read")` follows the parent document, and `read`
means published-and-not-private (`lib/access.ts:66-69`, CLAUDE.md route
conventions). An unapproved agent rewrite of a published post would therefore be
fetchable by anyone holding the revision id. The id is an unguessable uuid and
the content is the author's own, so this is a leak of _draft_ status rather than
of secrets — but a proposal should be owner-only regardless of the document's
publication state. Phase 2 owns it, in the same change that first creates a
proposal: there is no reason for a window where the two are apart.

The check needs a column it cannot currently see: `findRevisionById`'s select
(`repositories/revision.ts:6-21`) lists `id`, `documentId`, `createdAt` and
`data` and nothing else, so `proposedAt` has to be added there before anything
can branch on it.

**`getCachedRevision` never invalidates.** `requireRevision` reads through
`unstable_cache(findRevisionById, [], { tags: ["revision"] })`
(`repositories/revision.ts:24-26`) — no `revalidate`, and nothing in the app
calls `revalidateTag("revision")`; only the generic `/api/revalidate` route
exists. Before the squash this bit only the autosave fold. Now it is the design:
one revision id is rewritten on every batch and `GET /api/revisions/[id]` is how
the review UI fetches it, so the rail can offer a proposal squashed five times
while the diff renders batch one — and you approve content you never saw. Either
the proposal fetch bypasses the cache or `upsertProposal` revalidates the tag.
Phase 1 owns it, because phase 1 is what starts rewriting a live id.

**`POST /api/revisions` rewrites a known id.** The editor folds a run of
autosaves into one revision by re-posting its id, and `createRevision` is an
upsert (`repositories/revision.ts:59-64`). The proposal row is _also_ rewritten
in place (§3.2), but by the repository, never through that route — an autosave
must not be able to land on a pending proposal.

Today nothing collides, because `useSave` mints fresh uuids (`useSave.ts:152`).
But phase 4 hands proposal ids to the client for the diff, and
`components/Diff/index.tsx:16-35` still carries a duplicated fallback branch
that dispatches `actions.createRevision(...)` — the review surface is a write
path onto the row under review. Make it an invariant rather than a rule: the
upsert's update arm refuses a row with `proposedAt IS NOT NULL`. Same argument
as the partial index in §3.1 — it then holds against code nobody has written
yet.

## 3. Design

### 3.1 Schema

Reuse `Revision` rather than add a `Proposal` model, for one reason: the diff
view, the rail section, the fetch route and the store already speak `Revision`.
A new table means rebuilding all four.

```prisma
model Revision {
  // … existing fields
  proposedAt       DateTime?         // null = ordinary history
  origin           String?           // "claude-code"
  baseRevisionId   String?  @db.Uuid // the head this was built on — write once (§3.2)
  ops              Json?             // the batches folded into this proposal
  summary          String?           // one line, for the rail
  staleAt          DateTime?         // set when the base stops being head
  version          Int @default(0)   // CAS token for the squash (§3.2)
  @@index([documentId, proposedAt])
}

model Document {
  // … existing fields
  agentCreatedAt   DateTime?         // set by create_post, cleared on accept
  agentOrigin      String?
}
```

`proposedAt IS NULL` keeps every existing query correct by default — but the
history reads must gain an explicit `proposedAt: null` filter, or proposals leak
into the revision list as though they were history.

**At most one pending proposal per document** (§3.2). Enforce it in the database
with a partial unique index, not in application code:

```sql
CREATE UNIQUE INDEX revision_one_pending_per_document
  ON "Revision" ("documentId") WHERE "proposedAt" IS NOT NULL;
```

Prisma cannot express a partial unique index in the schema, so it goes in the
migration as raw SQL. Worth the awkwardness: the invariant then cannot be broken
by a code path nobody thought about.

### 3.2 One pending proposal, squashed — the load-bearing part

If Claude edits block 2 and then block 5, its second `outline` **must** see the
first edit. So the MCP server's `loadPost` resolves to the pending proposal when
one exists, not to `Document.head`.

Successive batches **squash into that one row**: the second write rewrites the
proposal rather than adding a second one, and appends its ops to `ops`. The
intermediate states existed only so the agent could read its own writes — there
is no reason to review them separately, and one pending thing per document means
nothing accumulates and the rail cannot fill with forty rows.

**`baseRevisionId` is written once, when the proposal is created, and a squash
must not touch it.** Refreshing it to whatever head is now is the worst bug
available in this plan. The second batch reads the _pending proposal_ rather
than head — that is the point of this section — so it never sees a save you made
in between; but a refreshed base makes §3.4's CAS match anyway, and approval
then moves head to content derived from the old base. Your save is gone, with no
409 and no staleness. An immutable base makes the CAS miss instead, which is the
entire safety property §3.4 claims.

Three failure modes, and they are the whole risk in this plan:

- **Folding onto `head` instead of onto the pending state** discards the earlier
  batch. Silent, and only visible after approval.
- **Two batches folding onto the same row concurrently**, last writer winning —
  the same lost batch, reached from the other direction. Today `saveRevision`'s
  guarded `updateMany` on `head` is what serializes an agent write against
  everything else, and §3.4 moves that CAS to approval time, so the write path
  is left with no guard at all. `version` is the replacement: read it with the
  proposal, `updateMany where { id, version }`, bump it, and treat a miss as
  re-read-and-re-apply. Nothing already in the row can serve instead —
  `createdAt` is what the squash itself rewrites.
- **Two proposals surviving** for one document — hence the partial unique index
  rather than a convention.

`stateHash` needs no change. It hashes whatever state was read, so it goes on
guarding addresses against the pending proposal exactly as it guards them
against head today.

### 3.3 Store the ops, not just the result

`Revision.data` is the materialized state, which is what the diff view wants.
`ops` accumulates the batches folded into the proposal. Neither rebasing (§3.6)
nor per-block approval needs to exist yet — storing the ops now is what makes
them cheap later, and they cost nothing meanwhile.

It grows without a bound and nothing prunes it: a long agent session appends
every batch to one Json column, and approval keeps them. At one author's scale
that is not worth a retention rule, but it is worth knowing it is unbounded
before someone runs a hundred-batch session.

### 3.4 Approve and reject

```
POST /api/documents/[id]/proposals/[revisionId]/approve
POST /api/documents/[id]/proposals/[revisionId]/reject
GET  /api/proposals/count                    // the §3.5 focus poll
```

The count route is `userRoute` and scoped to the caller's own documents. It is
named here rather than left to phase 4 because a bare count endpoint is exactly
the shape of thing that gets written as `publicRoute` without anyone deciding to
(CLAUDE.md: `grep -rn "publicRoute" src/app/api` is meant to stay the complete
list).

The two proposal routes take `userRoute` + `requireDocument(id, user, "own")` —
never a hand-rolled author comparison (CLAUDE.md). **`own`, not `write`**:
`collab` satisfies `write` (`lib/access.ts:62-63`, "anyone holding the link may
edit"), so on a collab document `write` would let any signed-in visitor approve
Claude's work into head, reject it, or — via §3.7's discard — delete the post.
Approving is an act _on_ the document rather than an edit _of_ its content,
which is the line `own` draws for rename, delete and move.

**`expectedHead` is the proposal's `baseRevisionId`**, and that is load-bearing.
It makes the CAS the staleness check for free: if you saved between the proposal
and the approval, head has moved off the base, the guarded `updateMany` matches
nothing, and approve 409s rather than silently discarding your own edit. Phase 5
(§3.6) then only has to _tell_ you it went stale — it is not what makes the
skeleton safe. Passing "whatever head is now" instead would invert that, so the
value is named here and not left to the implementer.

**Approve is one transaction, written in `repositories/revision.ts`.** Moving
`head` and clearing `proposedAt` cannot be `updateDocument` followed by a second
write: `updateDocument` opens its own `prisma.$transaction`
(`repositories/document.ts:365`) and takes no `tx`, so composing it leaves a
window in which head points at a row still flagged pending — the same broken
state §2.1's repair gotcha produces. `approveProposal` does the guarded
`updateMany` on `Document.head` and the `proposedAt` clear together, in one
transaction of its own.

**Reject deletes the row.** No `rejectedAt`, no retention story, no filter on
every history read — the content is not lost in any sense that matters, since
Claude can regenerate it and you rejected it deliberately.

### 3.5 Surfacing

Three tiers. The first two are cheap because the diff view exists.

| Tier             | What                                                                                                                                                             | Where                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Awareness        | A badge on the sidebar row; a `ProposalsSection` listing the pending proposal with origin, time and summary, plus any agent-created posts awaiting accept (§3.7) | `Layout/RightRail/`, `SideBar/`     |
| Review whole     | "Review" → `setDiffRevisions({ old: head, new: proposalId })` + `setDiffOpen(true)`, plus an approve/reject bar over the diff                                    | `components/Diff/`, `EditDocument/` |
| Review per block | Accept some ops, reject the rest                                                                                                                                 | new; needs §3.3                     |

The browser cannot know a terminal write happened. Cheapest signal consistent
with the quiet-UI rule (silent success, loud failure): poll the pending-count
endpoint (§3.4) on window focus and on document open. A badge that appears — not
a toast, not a modal. SSE is available if that proves too laggy, but it is a
second system to keep alive and should not be phase 1.

### 3.6 When you edit under a pending proposal

The proposal is built on a base. If you save afterwards, the base is no longer
head: **mark the proposal stale** (`staleAt`) and refuse to approve it. Ask
Claude again against current content.

Rebasing the stored ops by block id is the better answer _if staleness turns out
to be common_ — the ops name `blk_…` ids that survive edits elsewhere in the
tree, which is exactly what phase 5 of the bridge built them for. It is deferred
rather than dismissed: build the blunt version, find out how often it fires, and
only then decide. A rebase that half-applies is worse than a refusal.

### 3.7 Creates land, flagged

`create_post` has no head to withhold, and creating is additive — nothing is
overwritten and deleting it is one action. So a new post **lands normally**,
with `agentCreatedAt` set. It appears in the library, and in the same rail,
marked agent-created with two actions: accept (clear the flag) or discard
(delete the post). You see everything Claude made, without a second proposal
shape for a document that has no head yet.

"Lands normally" is not "goes live": `published` defaults to false
(`prisma/schema.prisma:72`) and `create_post` does not set it, so an
agent-created post is a draft nobody else can read until you publish it.

### 3.8 The gate is always on

Not an env flag, not a per-document column, not a rule derived from published
state. Every agent write to an existing document proposes. There is nothing to
configure, nothing to forget to switch on, and no mode where the terminal is
quietly authoritative.

Two consequences to build for:

- `apply_ops` must answer _"proposed, awaiting approval"_ rather than "updated",
  or Claude will report the change as live. The tool's own text is the only
  thing that tells it what happened.
- `apply_ops` also stops detecting a concurrent editor save. Today the guarded
  write fails loudly with `StaleHeadError`; once the write leaves `head` alone,
  it succeeds and the conflict surfaces only when you try to approve (§3.4's
  CAS). That is the intended trade — the human is the one who can resolve it —
  but the agent no longer gets told, so the tool text must not imply it checked.
- `mcp/smoke.ts`'s write path (`RUN_WRITE=1`) now produces a proposal instead of
  a save, so it must approve or clean up after itself.

**The in-app Copilot is unaffected.** It already shows a proposal and waits for
accept before writing — it is gated, just in-session. Claude Code is the case
that needs this, because it writes with nobody watching.

### 3.9 An approval under an open tab

If the tab has no unsaved edits, reload it to the new head **silently** — this
is a success, and the quiet-UI rule says successes do not announce themselves.
If it has unsaved edits, say so before replacing them.

Doing nothing was the cheap option and is wrong: the existing 409 path
(`fd67510e`) would eventually catch it, but until you next typed the screen
would keep showing content that is no longer the document.

**There is no dirty flag to read, and reintroducing one is the wrong fix.**
`SaveStatus` is `"idle" | "saving" | "retrying" | "error"` (`types.ts:146`) —
`idle` covers both "clean" and "typed, not yet flushed" — and `dirtyDocIds`,
`useDirtyTracking` and `selectIsDirty` were deleted deliberately when autosave
went quiet. `pendingSaves` only holds a record while a save is in flight or
conflicted, so it is not the signal either.

The signal that exists is `savedBaseline.current` inside `useSave`
(`useSave.ts:114`): the serialized state storage is known to hold. Phase 4
exposes an answer from that ref — "does the editor's current state differ from
the last acknowledged save" — rather than putting a dirty flag back in the
store. The distinction matters because it is one component asking itself a
question at one moment, not a piece of global state eight surfaces will start
rendering.

## 4. Phases, costed

Estimates are new-or-changed LOC and file counts, for a change that follows the
existing conventions. They are estimates.

| # | Phase                                                      | Size | Est.                           | Risk                                       | Blocks                      |
| - | ---------------------------------------------------------- | ---- | ------------------------------ | ------------------------------------------ | --------------------------- |
| 1 | Schema + repository + the §2.1 write paths                 | M    | ~230 LOC, 6 files, 1 migration | Low                                        | 2, 3                        |
| 2 | MCP proposes; squash; flagged creates; owner-only reads    | M    | ~170 LOC, 3 files              | **Medium** — §3.2 is the subtle part       | 3                           |
| 3 | Approve / reject / accept / discard routes, plus the count | S–M  | ~200 LOC, 6 files              | Low                                        | 4                           |
| 4 | Surfacing: rail, badge, review bar, tab reload             | M–L  | ~500 LOC, 9–11 files           | Low, but the §2.1 filter must be got right | —                           |
| — | **Walking skeleton = 1–4**                                 |      | **~1,100 LOC, ~22 files**      |                                            |                             |
| 5 | Staleness marking (§3.6)                                   | S    | ~80 LOC                        | Low                                        | —                           |
| 6 | Per-block approve/reject                                   | L    | ~500 LOC                       | Medium                                     | needs §3.3                  |
| 7 | Rebase by block id                                         | M–L  | ~300 LOC                       | Medium                                     | needs §3.3, evidence from 5 |

### Phase 1 — schema + repository

The migration in §3.1, including the partial unique index as raw SQL;
`proposedAt: null` in `revisionsSelect` (not in `toCloudDocument`'s non-collab
arm — §2.1) and on every other existing history read; `upsertProposal`,
`findPendingProposal`, `approveProposal`, `rejectProposal` in
`repositories/revision.ts`, with `approveProposal` as the single transaction
§3.4 describes.

`upsertProposal` is not a `prisma.revision.upsert`, despite the name. The
uniqueness lives in a partial index Prisma cannot see, so
`where: { documentId }` does not typecheck — `documentId` is not a Prisma
unique. Two workable shapes: find-then-create-or-update, which races and needs
the resulting `P2002` caught and retried, or raw
`INSERT … ON CONFLICT ("documentId") WHERE "proposedAt" IS NOT NULL DO UPDATE`,
which the partial index does support. Pick the raw one if the retry loop starts
looking like logic.

Plus the three §2.1 write paths, which are the ones a read-filter sweep will not
find: `findDocument`'s head repair skips proposals; `createRevision`'s upsert
refuses a row with `proposedAt` set; and the proposal fetch either bypasses
`getCachedRevision` or `upsertProposal` revalidates the `"revision"` tag —
adding `proposedAt` to `findRevisionById`'s select while there, since phase 2's
ownership check reads it.

_Done when:_ a proposal row can be created, squashed onto and listed from a
script; a second pending row for the same document is refused by the database;
deleting a document's head revision while a proposal is pending leaves `head`
alone rather than promoting it; re-reading a squashed proposal returns the
latest content; and the existing revision history is provably unchanged by any
of it.

### Phase 2 — the MCP server proposes

`loadPost` resolves the pending proposal; `saveRevision` upserts it with
`proposedAt`/`origin`/`baseRevisionId`, appends to `ops`, bumps `version` under
the CAS from §3.2, and leaves `head` alone; `apply_ops` reports that the change
is pending; `create_post` stamps `agentCreatedAt`; `smoke.ts` cleans up after
itself.

Two details inside `loadPost` that the rewrite has to carry: its no-head branch
falls back to `findFirst … orderBy createdAt desc`
(`content-server.ts:110-116`), and under gating "newest" can be the pending
proposal — it must resolve the proposal deliberately rather than by accident.
And `Loaded.head`'s comment, "the head this state was read at — the precondition
for writing it back" (`content-server.ts:83`), stops being true here: it becomes
the base pointer the proposal records, and nothing checks it at write time any
more.

Also the ownership tightening from §2.1, so a pending revision on a published
post is not world-readable. It lands here rather than in phase 3 because this is
the phase that starts creating them, and a window where proposals exist
unprotected is not worth the tidier phase boundary.

_Done when:_ three consecutive `apply_ops` calls against one document leave
**exactly one** pending proposal containing all three edits, each batch having
seen the previous one's work, with `head` untouched throughout and
`baseRevisionId` still naming the head the _first_ batch read. Write that test
before the code — it is the shape of the only real risk here.

### Phase 3 — approve, reject, accept, discard

The two proposal routes in §3.4 plus accept/discard for flagged posts (§3.7),
all four on `requireDocument(id, user, "own")`, and the pending-count route the
§3.5 poll needs, on `userRoute` and scoped to the caller.

_Done when:_ approving advances `head` and the content is what the diff showed;
approving twice is a no-op or a clean 409; approving after your own save 409s
rather than clobbering it; rejecting leaves no orphan; discarding removes the
post. **No automated check covers API authorization** (CLAUDE.md) — exercise
these against the local Postgres by hand, including as a signed-out caller and
as a second signed-in account against a document with `collab` set, which is the
case `write` would have let through.

### Phase 4 — the UI

Fix the head-only revision filter (§2.1) or add a dedicated pending fetch; a
`ProposalsSection` beside `RevisionsSection` covering both pending proposals and
flagged posts; a sidebar badge; an approve/reject bar over the existing diff;
focus-poll for the count; the reload-or-warn behaviour from §3.9, reading the
`useSave` baseline rather than a restored dirty flag.

Delete the duplicated fallback branch in `components/Diff/index.tsx:16-35` first
— both `try` blocks call the same thing, the "not in local, try cloud" comment
describes code that is not there, and the second dispatches `createRevision`.
Building the review bar on top of a component that can write the row it is
reviewing is not worth the saved half hour.

Follow DESIGN.md conventions; run `npm run check:theme`. Needs the required
states — loading, empty, error — and the empty state is the common one, so it
should be quiet rather than an illustration.

_Done when:_ a terminal edit shows up in the app without a manual reload,
reviews as a diff, and applies on approve. Verify in a real browser (see
`verify-ui-in-browser`).

### Phases 5–7

Optional, each taken only against evidence: staleness marking when the first
stale proposal actually bites, per-block approval when whole-proposal approval
proves too coarse, rebasing when marking proves too blunt to live with.

## 5. Tests owed

Per CLAUDE.md, logic lives in an import-free module so it is testable without
mounting anything. The testable core here is the **squash**: resolving the
pending proposal rather than head, folding a batch onto the pending state rather
than onto head, appending ops, carrying `baseRevisionId` through unchanged while
`version` advances, and what approval does to `proposedAt`. That belongs in a
pure function over rows — `repositories/` calls it, and a spec covers it with no
database. The base-immutability case is worth naming as its own assertion: it is
one field, and getting it wrong is the silent clobber in §3.2.

Head selection goes in the same module and gets the same treatment: given a set
of revision rows and a `head` id, which row is the document, and which row does
a repair fall back to (§2.1). It is a pure function over rows too, and it is the
shape of the bug that would auto-approve.

The parts no spec will cover: the routes' authorization (by hand, per CLAUDE.md)
and everything in phase 4 (a real browser).

## 6. Non-goals

- **Not a review workflow for humans.** Single-user blog; there is no second
  approver, no comments, no request-changes.
- **Not branching.** One pending proposal per document, enforced by the
  database. Two agents proposing concurrently is out of scope.
- **Not undo.** Approval is already reversible by pointing `head` back at the
  previous revision; that is a different feature and it can be built on this
  one.

## 7. Alternatives rejected

**A separate `Proposal` table.** Cleaner separation, and it avoids the
`proposedAt: null` filters entirely. Rejected because it forfeits the diff view,
the rail section, the fetch route and the store plumbing — every one of which
already speaks `Revision`. Revisit if proposals grow fields that embarrass the
revision model.

**A chain of proposals instead of a squash.** Reviewing Claude's work batch by
batch. Rejected: the intermediate states exist only so the agent can read its
own writes, reviewing them separately has no value, and keeping them means
inventing a retention rule for chains nobody ever approves (§3.2).

**A configurable gate** — env flag, per-document column, or published-only.
Rejected in favour of always on (§3.8). Every variant has a mode where the
terminal writes straight through, which is the exact situation this plan exists
to remove.

**Gating the in-app Copilot too.** It reviews in-session already; a persisted
proposal would be a second gate on a flow that has one (§3.8). Persisting its
proposals so they survive a reload remains available as a later, separate idea.

**Fork the document per change.** The schema already has `base`/`forks`.
Rejected because approval then means _merge_, and merging two Lexical documents
is a harder problem than the one being solved.

**Gate in the agent's system prompt.** "Ask before writing." Rejected: it is not
enforcement, and the failure mode is silent.

## 8. Decisions

Taken 6 Aug 2026. Rationale for each is in the section named.

| # | Question                   | Decision                                      | §   |
| - | -------------------------- | --------------------------------------------- | --- |
| 1 | Gate scope                 | Always on — no flag, no opt-out               | 3.8 |
| 2 | Does the Copilot gate too? | No — terminal only                            | 3.8 |
| 3 | `create_post`              | Lands normally, flagged for accept or discard | 3.7 |
| 4 | Successive edits           | Squash into one pending proposal              | 3.2 |
| 5 | Reject                     | Delete the row                                | 3.4 |
| 6 | You edit under a proposal  | Mark stale, require a re-run                  | 3.6 |
| 7 | Approval under an open tab | Silent if clean, warn if dirty                | 3.9 |
| 8 | Build now?                 | No — plan only, for now                       | —   |

Nothing is left open. The two things deliberately deferred rather than decided
are rebasing (§3.6, wants evidence) and per-block approval (phase 6, wants a
complaint about granularity).

## 9. Risks

- **A squash done wrong loses work silently** — an approved proposal missing an
  earlier batch, because the fold went onto `head` instead of onto the pending
  state, or because two folds raced and the later one overwrote the earlier
  (§3.2's `version` CAS is what stops the second; the write path has no other
  guard once `head` stops moving). This is the single real risk in the plan. The
  phase-2 acceptance test is exactly that shape and should be written first.
- **A squash that refreshes `baseRevisionId` loses _your_ work silently**, which
  is worse: approval's CAS then matches a base the proposal's content never saw,
  and your intervening save is overwritten with no 409 (§3.2). The field is
  write-once, and that is the one invariant here that has no database constraint
  behind it.
- **Two sources of "what the document says."** Head and pending proposal. Any
  new read path has to pick deliberately, and the wrong default is invisible
  until someone approves.
- **Three existing paths write `head` or a revision row without knowing about
  proposals** — the repair in `findDocument`, the upsert behind
  `POST /api/revisions`, and the never-invalidated revision cache (§2.1). None
  is a read, so none turns up in a search for history queries to filter; they
  are listed in phase 1 for exactly that reason.
- **A stale proposal is a dead end.** Until §3.6 gains rebasing, editing a
  document with a pending proposal means Claude's work has to be redone. If that
  happens often, phase 7 stops being optional.
