# Gating agent changes

**Status: proposal (2026-08-06).** Not started. Builds directly on the content
bridge ([claude-code-lexical.md](./claude-code-lexical.md), phases 1–5 shipped)
and on the `head` compare-and-set that landed in `fd67510e`.

Claude Code writes to the blog from the terminal, out of band, and the change is
live the moment it lands. This plan makes an agent write **proposed** rather than
committed: it goes to storage, it is visible in the app, and it becomes the
document only when you approve it.

## 1. The insight

`Document.head` is a pointer, and an agent write already creates a `Revision`
row. The write and the commit are therefore **already two operations** — gating
is a matter of not doing the second one.

```
today     apply_ops ──► INSERT Revision ──► head = revision.id       live at once
                                            (CAS on expected head)

gated     apply_ops ──► INSERT Revision ──► head unchanged           proposed
                        proposedAt set        │
                                              ├─► approve: head = revision.id  (same CAS)
                                              └─► reject:  delete the row
```

Approval is a one-row pointer move. Rejection costs nothing, because the
proposal was never reachable. **Nothing in `src/lib/content-bridge/` changes** —
not addressing, not the codecs, not `stateHash`. This is a plan about *where the
pointer points*, and everything expensive was built already.

## 2. What already exists

Measured against the tree at `05ba3a0d`.

| Asset | Where | What it gives us |
| --- | --- | --- |
| Full-state revisions | `Revision.data` | The proposal payload, already stored per write |
| Conditional head write | `updateDocument(…, expectedHead)`, `repositories/document.ts` | Approval that cannot clobber a concurrent save |
| Revision diff view | `components/Diff/index.tsx` | `generateHtml` both sides + `HtmlDiff.execute`. Compares **any two revision ids** — this is the review UI, near enough |
| Diff wiring | `setDiffRevisions` / per-pane `diffOpen` (`store/app.ts:310,543`) | "Review" = two dispatches |
| A rail to hang it on | `Layout/RightRail/RevisionsSection.tsx` | A sibling `ProposalsSection` is ~an afternoon |
| Revision fetch | `GET /api/revisions/[id]` | Loading a proposal's content client-side |
| Persistent block ids | `content-bridge/blockId.ts` | What makes rebasing and per-block approval possible at all |

### 2.1 Three gotchas, all findable only by reading

**The client never sees a non-head revision.** `toCloudDocument`
(`repositories/document.ts:99`) does

```ts
const revisions = post.collab
  ? post.revisions
  : post.revisions.filter((r) => r.id === post.head);
```

and `revisionsSelect` is `take: 1` besides. So a proposal is invisible to the
app **by construction** — `post.revisions` would arrive empty. Surfacing
proposals is not "they show up in the list"; it needs a deliberate change here or
its own fetch. Phase 4 owns it.

**A revision on a published post is world-readable.** `requireRevision(id, user,
"read")` follows the parent document, and `read` means published-and-not-private
(`lib/access.ts:121`, CLAUDE.md route conventions). An unapproved agent rewrite
of a published post would therefore be fetchable by anyone holding the revision
id. The id is an unguessable uuid and the content is the author's own, so this is
a leak of *draft* status rather than of secrets — but a proposal should be
owner-only regardless of the document's publication state. Phase 3 owns it.

**`POST /api/revisions` rewrites a known id.** The editor folds a run of
autosaves into one revision by re-posting its id. An approval flow must not reuse
that path, or an autosave could overwrite a pending proposal.

## 3. Design

### 3.1 Schema

Reuse `Revision` rather than add a `Proposal` model, for one reason: the diff
view, the rail section, the fetch route and the store already speak `Revision`.
A new table means rebuilding all four.

```prisma
model Revision {
  // … existing fields
  proposedAt       DateTime?        // null = ordinary history
  origin           String?          // "claude-code" | "copilot"
  baseRevisionId   String?  @db.Uuid // the tip this was built on
  summary          String?          // one line, for the rail
  @@index([documentId, proposedAt])
}
```

`proposedAt IS NULL` keeps every existing query correct by default — but the
history reads must gain an explicit `proposedAt: null` filter, or proposals leak
into the revision list as though they were history.

### 3.2 The pending tip — the load-bearing part

If Claude edits block 2 and then block 5, its second `outline` **must** see the
first edit. So the MCP server's `loadPost` resolves to the newest proposal for
the document when one exists, not to `Document.head`, and each new proposal
chains via `baseRevisionId`.

Get this wrong and gating silently breaks every multi-step edit: batch two is
built against stale content, and approving it discards batch one. It is the one
part of this plan that is not mechanical.

`stateHash` needs no change — it hashes whatever state was read, so it goes on
guarding addresses against the tip exactly as it guards them against head today.

Approving the tip means approving the chain: `head` moves to the tip, and every
proposal below it becomes ordinary history (`proposedAt = null`). Approving a
proposal that is not the tip is not supported — see §7.

### 3.3 Store the ops, not just the result

`Revision.data` is the materialized state, which is what the diff view wants.
Persist the ops batch alongside it (a JSON column, or a `ProposalOp` child table
if per-op state is wanted later). It buys two things:

- **Rebase.** Ops name `blk_…` ids, which survive edits elsewhere in the tree —
  so a proposal can often be re-applied onto a document you have since edited.
- **Per-block approval.** Accepting three ops of five is only expressible if the
  ops survived.

Neither is needed in phase 1. Storing them then is what makes them cheap later.

### 3.4 Approve and reject

```
POST /api/documents/[id]/proposals/[revisionId]/approve
POST /api/documents/[id]/proposals/[revisionId]/reject
```

`userRoute` + `requireDocument(id, user, "write")` — never a hand-rolled author
comparison (CLAUDE.md). Approve calls `updateDocument(id, { head: revisionId },
expectedHead)`; a 409 means the document moved under the proposal, and the answer
is rebase-or-rerun, never clobber. Reject deletes the row, or sets `rejectedAt`
if you want an audit trail — a decision, see §8.

### 3.5 Surfacing

Three tiers. The first two are cheap because the diff view exists.

| Tier | What | Where |
| --- | --- | --- |
| Awareness | A badge on the sidebar row; a `ProposalsSection` listing pending proposals with origin, time and summary | `Layout/RightRail/`, `SideBar/` |
| Review whole | "Review" → `setDiffRevisions({ old: head, new: proposalId })` + `setDiffOpen(true)`, plus an approve/reject bar over the diff | `components/Diff/`, `EditDocument/` |
| Review per block | Accept some ops, reject the rest | new; needs §3.3 |

The browser cannot know a terminal write happened. Cheapest signal consistent
with the quiet-UI rule (silent success, loud failure): poll a pending-count
endpoint on window focus and on document open. A badge that appears — not a
toast, not a modal. SSE is available if that proves too laggy, but it is a second
system to keep alive and should not be phase 1.

### 3.6 Conflicts with your own edits

A proposal is built on a base. If you edit the document afterwards, the base is
stale. Three answers, in ascending cost:

1. **Mark it stale** and require a re-run. Correct, trivial, occasionally
   annoying.
2. **Rebase by block id** — re-apply the stored ops onto the current head. Clean
   when the ops name blocks you did not touch, which is the common case.
3. **Per-block conflict resolution.** Not worth it here.

Take (1) in phase 5, (2) only if staleness proves common in practice.

### 3.7 Creates, and where the gate lives

`create_post` has no head to withhold. Creating is additive and reversible, so
the default should be that it lands as an ordinary unpublished draft rather than
inventing a proposal state for a document that does not exist yet — but see §8.

The gate must be **server-side**: `MCP_GATED=1` in `.mcp.json`'s `env`, not a
tool parameter. A gate the agent can choose to skip is a suggestion. `apply_ops`
must also answer *"proposed, awaiting approval"* rather than "updated", or Claude
will report the change as live — the tool's own text is the only thing telling it
what happened.

## 4. Phases, costed

Estimates are new-or-changed LOC and file counts, for a change that follows the
existing conventions. They are estimates.

| # | Phase | Size | Est. | Risk | Blocks |
| - | --- | --- | --- | --- | --- |
| 1 | Schema + repository | S–M | ~150 LOC, 4 files, 1 migration | Low | 2, 3 |
| 2 | MCP writes proposals; reads the tip | M | ~120 LOC, 1 file | **Medium** — §3.2 is the subtle part | 3 |
| 3 | Approve / reject routes | S | ~120 LOC, 4 files | Low | 4 |
| 4 | Surfacing: rail, badge, review bar | M–L | ~450 LOC, 8–10 files | Low, but the §2.1 filter must be got right | — |
| — | **Walking skeleton = 1–4** | | **~850 LOC, ~18 files** | | |
| 5 | Staleness marking | S | ~80 LOC | Low | — |
| 6 | Fold in the Copilot's proposals | M | ~250 LOC, 4 files | Medium | — |
| 7 | Per-block approve/reject | L | ~500 LOC | Medium | needs §3.3 |
| 8 | Rebase by block id | M–L | ~300 LOC | Medium | needs §3.3 |

### Phase 1 — schema + repository

The migration in §3.1; `proposedAt: null` filters on every existing history read;
`createProposal`, `listProposals`, `approveProposal`, `rejectProposal` in
`repositories/revision.ts`.

*Done when:* a proposal row can be created and listed from a script, and the
existing revision history is provably unchanged by it.

### Phase 2 — the MCP server proposes

`loadPost` resolves the pending tip; `saveRevision` writes `proposedAt`/`origin`/
`baseRevisionId` and leaves `head` alone under `MCP_GATED`; `apply_ops` reports
that the change is pending.

*Done when:* three consecutive `apply_ops` calls against one document produce a
chain of three proposals, each seeing the previous one's edits, with `head`
untouched throughout. `mcp/smoke.ts` gains that case.

### Phase 3 — approve and reject

The two routes in §3.4, plus the ownership tightening from §2.1 so a pending
revision on a published post is not world-readable.

*Done when:* approving advances `head` and the content is what the diff showed;
approving twice is a no-op or a clean 409; rejecting leaves no orphan. **No
automated check covers API authorization** (CLAUDE.md) — exercise these against
the local Postgres by hand, including as a signed-out caller.

### Phase 4 — the UI

Fix the head-only revision filter (§2.1) or add a dedicated pending fetch; a
`ProposalsSection` beside `RevisionsSection`; a sidebar badge; an approve/reject
bar over the existing diff; focus-poll for the count.

Follow DESIGN.md conventions; run `npm run check:theme`. Needs the required
states — loading, empty, error — and the empty state is the common one, so it
should be quiet rather than an illustration.

*Done when:* a terminal edit shows up in the app without a manual reload, reviews
as a diff, and applies on approve. Verify in a real browser (see
`verify-ui-in-browser`).

### Phases 5–8

Optional, and each is worth taking only against evidence: staleness marking when
you hit a stale proposal, rebasing when marking proves too blunt, per-block
approval when whole-proposal approval proves too coarse, Copilot unification when
losing an ephemeral proposal on reload actually annoys you.

## 5. Tests owed

Per CLAUDE.md, logic lives in an import-free module so it is testable without
mounting anything. The testable core here is the **chain**: tip resolution, what
approving a tip does to the proposals below it, and what a stale base looks like.
That belongs in a pure function over rows — `repositories/` calls it, and a spec
covers it with no database.

The parts no spec will cover: the routes' authorization (by hand, per CLAUDE.md)
and everything in phase 4 (a real browser).

## 6. Non-goals

- **Not a review workflow for humans.** Single-user blog; there is no second
  approver, no comments, no request-changes.
- **Not branching.** One pending chain per document. Two agents proposing
  concurrently is out of scope.
- **Not undo.** Approval is already reversible by pointing `head` back at the
  previous revision; that is a different feature and it can be built on this one.

## 7. Alternatives rejected

**A separate `Proposal` table.** Cleaner separation, and it avoids the
`proposedAt: null` filters entirely. Rejected because it forfeits the diff view,
the rail section, the fetch route and the store plumbing — every one of which
already speaks `Revision`. Revisit if proposals grow fields that embarrass the
revision model.

**Fork the document per change.** The schema already has `base`/`forks`. Rejected
because approval then means *merge*, and merging two Lexical documents is a
harder problem than the one being solved.

**Git-style branches over revisions.** Approving a non-tip proposal, reordering
proposals, resolving between them. Rejected as a large amount of machinery for a
single-user blog; §3.2's "approve the tip, or nothing" is the deliberate cheap
version.

**Gate in the agent's system prompt.** "Ask before writing." Rejected: it is not
enforcement, and the failure mode is silent.

## 8. Open decisions

1. **Gate scope.** All agent writes, or per-document opt-in? An env flag is the
   cheap start; a per-document `gated` column is the honest end state if you want
   some posts to stay direct-write.
2. **Reject = delete, or `rejectedAt`?** An audit trail of what Claude proposed
   and you turned down has some value for tuning prompts, and costs a column plus
   a filter.
3. **Does `create_post` gate?** §3.7 argues no. It is a call.
4. **What happens to an open tab on approval?** If it has unsaved edits, approving
   under it makes its next save 409 — correctly, that path exists now. Whether it
   reloads silently, prompts, or just surfaces the conflict is a UX decision, and
   it interacts with `pendingSaves` restore.
5. **Does the in-app Copilot gate too?** Its proposals are already reviewed
   in-session, so gating would be a second gate. Phase 6 is about *persisting*
   them, not adding a gate.

## 9. Risks

- **§3.2 done wrong loses work silently** — an approved chain that dropped its
  middle. The phase-2 acceptance test is specifically that shape and should be
  written before the code.
- **Proposals accumulate.** Nothing prunes them. A document with forty stale
  proposals is a slow rail section and a confusing one; decide a retention rule
  in phase 1 rather than after.
- **Two sources of "what the document says."** Head and tip. Any new read path
  has to pick deliberately, and the wrong default is invisible until someone
  approves.
