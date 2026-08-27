# Plans

Proposals and in-flight work. **Each file states its own status at the top —
read that first.** A plan describes an intended state, not the current one.

Shipped plans move to [archive/](./archive/) rather than being deleted — the
code cites them by section number. See [archive/README.md](./archive/README.md)
for what has landed and when.

## Live

| Plan                                                       | Status                                                                                                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [production-deployment.md](./production-deployment.md)     | **Decided 13 Aug 2026, steps 1–4 of §9 done, not yet deployed** — a single VPS running Docker Compose. The third hosting decision in two weeks; the other two are recorded because their reasoning still reads, not because they are live. Re-checked against the tree 15 Aug: §2.1 is new (an object store went from "not a blocker" to a hard prerequisite), §5 now has three things to back up rather than two, §9 grew a scheduler step, and §8's AI-spend blocker is resolved — there is no deployment API key left to spend. **Corrected again 27 Aug**, and mostly by subtraction: the background images §2 called "nearly all of the data" were a removed feature's orphans, so there is one upload volume rather than two, §5's disk side is ~180KB against a bucket holding everything else, and §9's step 7 is copying 11 files. §2 keeps the wrong version alongside the right one — the volume that protected dead data was still the correct call on what was known |
| [blob-storage.md](./blob-storage.md)                       | **All five phases built for images (15 Aug 2026)** — one content-addressed store for every byte, on R2. Measured before designing, and the migration bore it out: one PNG stored 67 times took the dev database from 34 MB to 19 MB. §3.1, §3.2, §10.1, §11.1 and §11.2 are corrections and findings written while building — §11.1 retires §8's local blob store, whose premise phase 2 had already invalidated, and §11.2 records that the collector has nowhere to run on a schedule until the VPS exists. **§10.2 (27 Aug) closes §10's step 5 by subtraction** — backgrounds were a removed feature's leftovers and are deleted rather than migrated (~19MB, and §10's expected outcome was wrong about them); attachments stay on disk because `PUT /api/attachments/[filename]` edits in place and content addressing cannot express that. What is left: scheduling, and the sketch/graph rendering decision. Supersedes [archive/storage-uploads.md](./archive/storage-uploads.md) |
| [claude-code-backlog.md](./claude-code-backlog.md)         | **Backlog.** What the content bridge does _not_ do, and why. Several items are decisions rather than work. §4, nested editors, is **answered 27 Aug 2026** — address into them — and the work is `nested-editor-support.md` |
| [nested-editor-support.md](./nested-editor-support.md)     | **Decided 27 Aug 2026, not started.** Closes `claude-code-backlog.md` §4 and reopens `haklex-reprise.md` §11.3's refusal. The blocker was never nesting: canvas, image and sticky are inline decorators, so they sit inside a paragraph and have no address to descend from. §2 is the re-measurement that unblocks it — all 192 stored canvases and all 67 images are alone in their wrapping paragraph, so the prose-splitting call §11.3 refused on has no instances |
| [haklex-reprise.md](./haklex-reprise.md)                   | **DONE 14 Aug 2026** — five of seven phases shipped (964 tests); phase 7 refused on evidence, and that refusal invalidates §9's claim that this closes `claude-code-backlog.md` §4. Not archived yet: 41 code comments cite it |
| [code-block-card.md](./code-block-card.md)                 | **Shipped 14 Aug 2026 (`7ec096a7`)**; its status line said "not started" until 15 Aug. Converges the two code-block chromes (a portalled overlay for the editor, an imperative enhancer for `/view`) onto one card in the node's own DOM. Reopens what `archive/haklex-adoption.md` §6.1 lost as collateral when §10.7 cut Shiki. Ready to archive once its citations are updated |
| [theme-css-tokenization.md](./theme-css-tokenization.md)   | **Phase 1 shipped 14 Aug 2026**, phases 2–5 open. The lasting half landed: `check:theme` now has a rule about *position* rather than file extension, so a literal outside a token block is an error in `.css` too. What is left is the attachment card and the second syntax theme duplicating `--tok-*`, deferred behind one named entry that fails the run when it stops suppressing anything. §7 records four claims this plan got wrong — chiefly a 5× undercount |
| [ide-redesign.md](./ide-redesign.md)                       | All three phases of the visible pass shipped; only its deferred list is left — status bar, AI panel restyle, tabs/breadcrumb polish                    |
| [workspace-url.md](./workspace-url.md)                     | Proposal, 1 Aug 2026 — the workspace URL should stop projecting pane focus and become an entry point. Refines [archive/workspace-panes.md](./archive/workspace-panes.md) §0 rather than reversing it |
| [bloat-remediation.md](./bloat-remediation.md)             | Steps 1–6 done (re-verified 30 Jul 2026); only step 7 is left, still blocked on the brief below                                                        |
| [tree-model-brief.md](./tree-model-brief.md)               | **Answered 27 Aug 2026: yes, `/posts` renders projects.** Option A — the unified `TreeNode` model in `src/lib/tree/`, net ≈ −135 LOC after ~200 LOC of new project UI. Unblocks step 7 of `bloat-remediation.md` |
| [ordering-simplification.md](./ordering-simplification.md) | Proposal — see below                                                                                                                                   |
| [schema-organization.md](./schema-organization.md)         | Proposal — see below                                                                                                                                   |
| [series-as-node.md](./series-as-node.md)                   | Sketch for comparison, not an approved plan. **Deferred 27 Aug 2026** until `rank` is gone — not refused, just decided against a base that is about to change |

## Housekeeping the next pass should do

Three plans are finished but still sitting here, and the reason is the same in
each case — the code cites them by section number, so moving one means updating
those citations in the same commit (see the note at the top of this file):

- **`haklex-reprise.md`** — done 14 Aug, 41 code comments cite it.
- **`code-block-card.md`** — shipped in `7ec096a7`. Its status line said "not
  started" for a day and has been corrected; only the move is left.
- **`blob-storage.md`** — all five phases built, but two things are genuinely
  open (§11.2 scheduling, §10.1 sketches and graphs), so it stays live until
  those close rather than for a citation reason. §10's step 5 is no longer one of
  them: §10.2 closed it on 27 Aug, and neither half ended in the store.

## Answered 27 Aug 2026

All three of the items that were blocked on a human answer rather than on work
have one. Nothing in this file is now waiting on a decision.

- **Does `/posts` render projects?** — **yes.** `tree-model-brief.md` takes
  option A, the unified `TreeNode` model, which unblocks step 7 of
  `bloat-remediation.md` and fixes the live cross-series drag-reorder bug
  (`tree-model-brief.md` §3) by construction.
- **Nested editors: address into them, or refuse explicitly?** — **address into
  them, fully.** The cost §4 deferred on is a live-editor cost and the bridge
  never touches one. The work is `nested-editor-support.md`, and the reason it
  is bigger than a codec is that the real blocker turned out to be `isInline()`
  rather than nesting.
- **Commit to Plan 3 (series-as-node)?** — **deferred, not refused.** Revisit
  after ordering phase 5 deletes `rank`; the sequencing below already put it
  last, so nothing waits on this.

---

## Content model & ordering simplification

The last three in the table are related proposals to simplify how content is
modeled and ordered, optimizing for **less code and easier maintenance under a
single-user blog**. They started from one question — "is the `rank`-based
reordering the best way?" — and fanned out into the schema underneath it.

Read them in this order:

| # | Plan                                                       | Owns                                                                                       | Churn        |
| - | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------ |
| 1 | [ordering-simplification.md](./ordering-simplification.md) | Replace fractional `rank` with an ordered id array per container                           | Low–moderate |
| 2 | [schema-organization.md](./schema-organization.md)         | Idiomatic schema cleanup (timestamptz, real FKs, enums, dead-field/index removal, renames) | Low–moderate |
| 3 | [series-as-node.md](./series-as-node.md)                   | Fold `Series` into the `Document` node tree so ordering is one `childOrder` mechanism      | High         |

Plans 1 and 2 are complementary and largely independent. Plan 3 is the _unifying
end state_ that subsumes parts of both — take it only if you want the cleanest
possible model and will spend the refactor once.

---

## The core trade

- **Plans 1 + 2** get ~90% of the ordering simplification (delete fractional
  indexing, one array per container) at low blast radius — but leave a
  permanently **polymorphic root array** (document + series ids across two
  tables) and the whole `Series` subsystem in place.
- **Plan 3** designs the two-table root problem _out_ (everything is one node,
  root order is homogeneous, one `moveNode`, one `childOrder`) — at the cost of
  a genuine domain refactor (`Series` spans 56 files, a 459-line repo, 5 API
  routes, its own Redux slice).

## Recommended sequencing

Land the small, safe work first; sequence the high-churn unification **last**,
on top of an already-simplified base — never all at once.

1. **Schema Phase A — the safe sweep** (from Plan 2): `timestamptz` everywhere,
   drop OAuth1 columns, drop redundant `[authorId]` indexes, `role` → enum. Pure
   DB / no app-logic change. Ship it independently.

2. **Ordering, Phases 1–3** (from Plan 1): add order-array columns, backfill
   from `rank`, switch _reads_ to the arrays + tolerant `orderBy`. Order is now
   array-driven for reads while writes still go through `rank` — safe cutover
   point. This also fixes the latent bug where grouped/time views still sort by
   `createdAt`.

3. **Ordering, Phase 4 — write cutover** (from Plan 1): new order endpoints +
   thunks, UI drag/menu builds id arrays, remove the `between`/bracketing
   plumbing.

4. **Schema Phases B–D** (from Plan 2): `head` → real FK, `name → title` /
   `background_image → backgroundImage` renames, drop dead `type`/coauthors.
   Coordinate Phase D with the next step (both touch `Document` indexes).

5. **Ordering, Phase 5 — delete `rank`** (from Plan 1): drop the `rank`
   columns/indexes, the `fractional-indexing` dep, `lib/ordering.ts`,
   `lib/documentOrder.ts`, most of `repositories/ordering.ts`.

   → At this point the two-plan approach is **complete**. Everything below is
   optional and only if you commit to Plan 3.

6. **Series-as-node** (Plan 3): project each `Series` row into a `kind = SERIES`
   `Document` (preserving id), repoint posts' `parentId`, fold the three order
   arrays into one `childOrder`, collapse the `series` Redux slice into a node
   selector, retire `repositories/series.ts` and `/api/series/*`. Do this as one
   focused refactor once `rank` is already gone.

## Decisions locked so far

- Ordering model: **ordered id array per container** (not fractional rank, not
  integer position). Re-home = move + append; a follow-up order write positions.
- Content model: **single self-referential `Document` node** with a clean
  identity (keep the model name, drop the vestigial `type`).
- Cleanup scope: timestamptz everywhere · `head` → real FK · `role`/status enums
  · delete dead fields · drop redundant indexes · rename for consistency.

## Open decisions

- **Drop `DocumentCoauthors` + `collab` entirely?** Recommended — already
  stubbed to `[]` and meaningless single-user. (Plan 2 §5.)
- **Commit to Plan 3 (Series-as-node)?** The high-churn unification — do it
  last, or not at all if blast radius matters more than a fully uniform model.
- `timestamptz` backfill assumes stored values are UTC; confirm before the cast.
