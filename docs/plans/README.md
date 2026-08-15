# Plans

Proposals and in-flight work. **Each file states its own status at the top —
read that first.** A plan describes an intended state, not the current one.

Shipped plans move to [archive/](./archive/) rather than being deleted — the
code cites them by section number. See [archive/README.md](./archive/README.md)
for what has landed and when.

## Live

| Plan                                                       | Status                                                                                                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [production-deployment.md](./production-deployment.md)     | **Decided 13 Aug 2026, not yet implemented** — a single VPS running Docker Compose. The third hosting decision in two weeks; the other two are recorded because their reasoning still reads, not because they are live |
| [blob-storage.md](./blob-storage.md)                       | **Phases 1–4 done for images (15 Aug 2026); only phase 5 open** — one content-addressed store for every byte, on R2. Measured before designing, and the migration bore it out: one PNG stored 67 times took the dev database from 34 MB to 19 MB. §3.1, §3.2, §10.1 and §11.1 are corrections written while building — the last of them retires §8's local blob store, whose premise phase 2 had already invalidated. What is left: garbage collection, and the sketch/graph rendering decision. Supersedes [archive/storage-uploads.md](./archive/storage-uploads.md) |
| [claude-code-backlog.md](./claude-code-backlog.md)         | **Backlog.** What the content bridge does _not_ do, and why. Several items are decisions rather than work — chiefly §4, nested editors, which gates three codecs and 198 real nodes. That one now has a proposed answer in `haklex-reprise.md` §2.2 |
| [haklex-reprise.md](./haklex-reprise.md)                   | **DONE 14 Aug 2026** — five of seven phases shipped (964 tests); phase 7 refused on evidence, and that refusal invalidates §9's claim that this closes `claude-code-backlog.md` §4. Not archived yet: 41 code comments cite it |
| [code-block-card.md](./code-block-card.md)                 | Proposal, 14 Aug 2026 — **shipped, log pending.** Converges the two code-block chromes (a portalled overlay for the editor, an imperative enhancer for `/view`) onto one card in the node's own DOM. Reopens what `archive/haklex-adoption.md` §6.1 lost as collateral when §10.7 cut Shiki |
| [theme-css-tokenization.md](./theme-css-tokenization.md)   | **Phase 1 shipped 14 Aug 2026**, phases 2–5 open. The lasting half landed: `check:theme` now has a rule about *position* rather than file extension, so a literal outside a token block is an error in `.css` too. What is left is the attachment card and the second syntax theme duplicating `--tok-*`, deferred behind one named entry that fails the run when it stops suppressing anything. §7 records four claims this plan got wrong — chiefly a 5× undercount |
| [ide-redesign.md](./ide-redesign.md)                       | All three phases of the visible pass shipped; only its deferred list is left — status bar, AI panel restyle, tabs/breadcrumb polish                    |
| [workspace-url.md](./workspace-url.md)                     | Proposal, 1 Aug 2026 — the workspace URL should stop projecting pane focus and become an entry point. Refines [archive/workspace-panes.md](./archive/workspace-panes.md) §0 rather than reversing it |
| [bloat-remediation.md](./bloat-remediation.md)             | Steps 1–6 done (re-verified 30 Jul 2026); only step 7 is left, still blocked on the brief below                                                        |
| [tree-model-brief.md](./tree-model-brief.md)               | Decision brief — awaits one product call: does `/posts` render projects?                                                                               |
| [ordering-simplification.md](./ordering-simplification.md) | Proposal — see below                                                                                                                                   |
| [schema-organization.md](./schema-organization.md)         | Proposal — see below                                                                                                                                   |
| [series-as-node.md](./series-as-node.md)                   | Sketch for comparison, not an approved plan — see below                                                                                                |

## Blocked on a decision, not on effort

Three items are waiting on a human answer rather than on work. They are listed
together because a plan blocked on a question reads exactly like one that has
stalled:

- **Does `/posts` render projects?** — blocks `tree-model-brief.md`, and through
  it step 7 of `bloat-remediation.md`.
- **Nested editors: address into them, or refuse explicitly?** —
  `claude-code-backlog.md` §4. Blocks the `image`, `sticky` and `canvas` codecs.
  **An answer is now on the table** rather than merely a choice:
  `haklex-reprise.md` proposes "address into them, as ordinary containers", on
  the ground that the cost §4 deferred on — every op knowing which document it
  operates on — is a live-editor cost, and the bridge never touches one.
- **Commit to Plan 3 (series-as-node)?** — the high-churn unification below.

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
