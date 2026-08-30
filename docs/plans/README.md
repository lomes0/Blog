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
| [blob-storage.md](./blob-storage.md)                       | **All five phases built for images (15 Aug 2026)** — one content-addressed store for every byte, on R2. Measured before designing, and the migration bore it out: one PNG stored 67 times took the dev database from 34 MB to 19 MB. §3.1, §3.2, §10.1, §11.1 and §11.2 are corrections and findings written while building — §11.1 retires §8's local blob store, whose premise phase 2 had already invalidated, and §11.2 records that the collector has nowhere to run on a schedule until the VPS exists. **§10.2 (27 Aug) closes §10's step 5 by subtraction** — backgrounds were a removed feature's leftovers and are deleted rather than migrated (~19MB, and §10's expected outcome was wrong about them); attachments stay on disk because `PUT /api/attachments/[filename]` edits in place and content addressing cannot express that. What is left is two genuinely open things — §11.2 scheduling the collector and §10.1's sketch/graph rendering decision — which is why this one stays live, not a citation reason. Supersedes [archive/storage-uploads.md](./archive/storage-uploads.md) |
| [claude-code-backlog.md](./claude-code-backlog.md)         | **Backlog.** What the content bridge does _not_ do, and why. **Nothing on it is capability work any more (27 Aug 2026)** — §4 was answered "address into them" and `nested-editor-support.md` shipped it, which closed §2 as well: a canvas's notes became addressable rather than merely describable. **§5 and §6 were answered and built on 28 Aug** (`65db740d`, `97bdb583`) — a proposal now names the rich blocks its deletes remove, and `create_post` hands back the author's series as candidates rather than filing the post itself. What is left is two decisions, neither of them work: §3 (semantic search, needs a concrete failure first) and §7 (local drafts, recommendation: accept and document) |
| [nested-editor-support.md](./nested-editor-support.md)     | **DONE — both phases shipped 27 Aug 2026** (`e8d1abd1`, `5c56c06c`). Closed `claude-code-backlog.md` §4 and §2, and overturned `archive/haklex-reprise.md` §11.3's refusal — which was right about the mechanism and wrong about the corpus. The blocker was never nesting: canvas, image and sticky were inline decorators, so they sat inside a paragraph with no address to descend from. They are block-level now, `pnpm nodes:unwrap` rewrote the stored revisions (259 wrapper paragraphs, 5 documents, 0 skipped), a canvas's notes address as `b2.1` and their blocks as `b2.1.1`, and an image's caption is a codec field. §7 records the two things this plan got wrong — threading the parent was avoidable, and neither a canvas nor a note needs a codec. Not archived: `containers.ts` and `address.ts` cite it |
| [ide-redesign.md](./ide-redesign.md)                       | All three phases of the visible pass shipped; only its deferred list is left — status bar, AI panel restyle, tabs/breadcrumb polish                    |
| [bloat-remediation.md](./bloat-remediation.md)             | **Steps 1–7 done (27 Aug 2026).** Step 7 shipped the day its product question was answered — `/posts` builds its root list with `groupRootItems` and `rootItemsToTreeNodes`, the same pair the sidebar uses, and `ProjectRow` gives a project a row containing its series. What is left is not code: cross-series drag reorder and multi-select drag have never been exercised in a browser, and both have broken on this surface before. The brief it waited on is [archive/tree-model-brief.md](./archive/tree-model-brief.md) |
| [ordering-simplification.md](./ordering-simplification.md) | Proposal — see below                                                                                                                                   |
| [schema-organization.md](./schema-organization.md)         | Proposal — see below                                                                                                                                   |
| [series-as-node.md](./series-as-node.md)                   | Sketch for comparison, not an approved plan. **Deferred 27 Aug 2026** until `rank` is gone — not refused, just decided against a base that is about to change |

## Answered 27 Aug 2026

All three of the items that were blocked on a human answer rather than on work
have one. Nothing in this file is now waiting on a decision.

- **Does `/posts` render projects?** — **yes.** `archive/tree-model-brief.md`
  takes option A, the unified `TreeNode` model, which unblocked step 7 of
  `bloat-remediation.md` and fixes the live cross-series drag-reorder bug
  (`archive/tree-model-brief.md` §3) by construction.
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
