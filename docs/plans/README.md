# Plans

Proposals and in-flight work. **Each file states its own status at the top —
read that first.** A plan describes an intended state, not the current one.

Shipped plans move to [archive/](./archive/) rather than being deleted — the
code cites them by section number. See [archive/README.md](./archive/README.md)
for what has landed and when.

## Live

| Plan                                                       | Status                                                                                                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [production-deployment.md](./production-deployment.md)     | **Decided 13 Aug 2026; §9 steps 1–4 done and 8–9 written, not yet deployed** — a single VPS running Docker Compose. The third hosting decision in two weeks; the other two are recorded because their reasoning still reads, not because they are live. Re-checked against the tree 15 Aug: §2.1 is new (an object store went from "not a blocker" to a hard prerequisite), §5 now has three things to back up rather than two, §9 grew a scheduler step, and §8's AI-spend blocker is resolved — there is no deployment API key left to spend. **Corrected again 27 Aug**, and mostly by subtraction: the background images §2 called "nearly all of the data" were a removed feature's orphans, so there is one upload volume rather than two, §5's disk side is ~180KB against a bucket holding everything else, and §9's step 7 is copying 11 files. §2 keeps the wrong version alongside the right one — the volume that protected dead data was still the correct call on what was known. **§10 added 31 Aug 2026:** steps 8 and 9 are written — `ops/` carries the backup, the offsite blob copy, the collector and a restore drill that reconciles a restored bucket against the database, on systemd timers. Neither has run against a box, and testing the mechanism found the compose file pinned `postgres:16` against a 17.2 development server, which would have failed on the first restore |
| [blob-storage.md](./blob-storage.md)                       | **All five phases built for images (15 Aug 2026)** — one content-addressed store for every byte, on R2. Measured before designing, and the migration bore it out: one PNG stored 67 times took the dev database from 34 MB to 19 MB. §3.1, §3.2, §10.1, §11.1 and §11.2 are corrections and findings written while building — §11.1 retires §8's local blob store, whose premise phase 2 had already invalidated, and §11.2 records that the collector has nowhere to run on a schedule until the VPS exists. **§10.2 (27 Aug) closes §10's step 5 by subtraction** — backgrounds were a removed feature's leftovers and are deleted rather than migrated (~19MB, and §10's expected outcome was wrong about them); attachments stay on disk because `PUT /api/attachments/[filename]` edits in place and content addressing cannot express that. What was left was two genuinely open things — §11.2 scheduling the collector and §10.1's sketch/graph rendering decision — and both are answered now. Supersedes [archive/storage-uploads.md](./archive/storage-uploads.md). **§13 (31 Aug) takes the last open decision — §10.1's — and takes it yes:** graph and sketch join image in `MIGRATABLE_TYPES`, on the finding that all five distinct stored SVGs are self-contained (a sketch embeds its font as a `data:font/woff2` URI; a graph has no style at all), which is the property that decides whether an inline `<svg>` may become an `<img>`. SketchNode gained the prefix guard GraphNode always had. **§13.6: run the same day** — 2 documents, 47 revisions, 77 occurrences, 5 blobs; `Revision` 9136 kB → 7120 kB after a vacuum, rehearsed against a restored dump first. **§13.7: the browser pass passed the same day** — all three render paths across both types, the only visible change being a sketch's text moving from a serif fallback to its own embedded Excalifont, which is §13.2's prediction. Dark mode survives because the filter rule already named `:is(img, svg)`. **§13.8** then ran down the caption bug §13.7 found — not the float and not the migration, but a caption paragraph carrying `indent: 8`, which is 320px of a 336px box; fixed by making a caption not indent, in both the editor's and `exportDOM`'s spelling of it. What keeps this plan live is §11.2's scheduling alone |
| [claude-code-backlog.md](./claude-code-backlog.md)         | **Backlog.** What the content bridge does _not_ do, and why. **Nothing on it is capability work any more (27 Aug 2026)** — §4 was answered "address into them" and `nested-editor-support.md` shipped it, which closed §2 as well: a canvas's notes became addressable rather than merely describable. **§5 and §6 were answered and built on 28 Aug** (`65db740d`, `97bdb583`) — a proposal now names the rich blocks its deletes remove, and `create_post` hands back the author's series as candidates rather than filing the post itself. What is left is two decisions, neither of them work: §3 (semantic search, needs a concrete failure first) and §7 (local drafts, recommendation: accept and document) |
| [nested-editor-support.md](./nested-editor-support.md)     | **DONE — both phases shipped 27 Aug 2026** (`e8d1abd1`, `5c56c06c`). Closed `claude-code-backlog.md` §4 and §2, and overturned `archive/haklex-reprise.md` §11.3's refusal — which was right about the mechanism and wrong about the corpus. The blocker was never nesting: canvas, image and sticky were inline decorators, so they sat inside a paragraph with no address to descend from. They are block-level now, `pnpm nodes:unwrap` rewrote the stored revisions (259 wrapper paragraphs, 5 documents, 0 skipped), a canvas's notes address as `b2.1` and their blocks as `b2.1.1`, and an image's caption is a codec field. §7 records the two things this plan got wrong — threading the parent was avoidable, and neither a canvas nor a note needs a codec. Not archived: `containers.ts` and `address.ts` cite it |
| [ide-redesign.md](./ide-redesign.md)                       | All three phases of the visible pass shipped; only its deferred list is left — status bar, AI panel restyle, tabs/breadcrumb polish                    |
| [bloat-remediation.md](./bloat-remediation.md)             | **Steps 1–7 done (27 Aug 2026).** Step 7 shipped the day its product question was answered — `/posts` builds its root list with `groupRootItems` and `rootItemsToTreeNodes`, the same pair the sidebar uses, and `ProjectRow` gives a project a row containing its series. What is left is not code: cross-series drag reorder and multi-select drag have never been exercised in a browser, and both have broken on this surface before. The brief it waited on is [archive/tree-model-brief.md](./archive/tree-model-brief.md) |
| [schema-organization.md](./schema-organization.md)         | **All four phases shipped** — A on 30 Aug 2026, B–D on 31 Aug. `timestamptz` on all 21 bare `DateTime` columns, `User.role` an enum, `head` a real FK as `headRevisionId`, `Document.name → title`, and `Document.type` / `DocumentType` / `background_image` gone. Coauthors **stay** — §5's recommendation was declined. Kept out of `archive/` because the new code cites §B/§C/§D/§7 by this path. §6 and §7 are the phase logs; the findings worth carrying forward are that "no app-logic change" was false, that Prisma generates a destructive `DROP` + `ADD` for three of the four column changes, and that `tsc` cannot see a field rename through an `as const` select or a `$queryRaw` template |

## Answered

All three of the items that were blocked on a human answer rather than on work
have one, and the last of them closed on 31 Aug 2026. **Nothing on this page is
waiting on a human.**

- **Does `/posts` render projects?** — **yes.** `archive/tree-model-brief.md`
  takes option A, the unified `TreeNode` model, which unblocked step 7 of
  `bloat-remediation.md` and fixes the live cross-series drag-reorder bug
  (`archive/tree-model-brief.md` §3) by construction.
- **Nested editors: address into them, or refuse explicitly?** — **address into
  them, fully.** The cost §4 deferred on is a live-editor cost and the bridge
  never touches one. The work is `nested-editor-support.md`, and the reason it
  is bigger than a codec is that the real blocker turned out to be `isInline()`
  rather than nesting.
- **Commit to Plan 3 (series-as-node)?** — **no.** Deferred on 27 Aug until
  `rank` was gone, re-costed against the tree when it went, and **declined on 31
  Aug 2026**: §3's payoff had already been delivered by the ordering work
  without the refactor, leaving one *content* model as the only remaining prize
  at 76 files and two repositories. Archived with the decision as its §10 —
  [archive/series-as-node.md](./archive/series-as-node.md). Read §9.2 before
  reopening it: folding `Series` alone is the one option that pays the churn
  without buying the benefit.

---

## Content model & ordering simplification — closed 31 Aug 2026

Three related proposals to simplify how content is modeled and ordered,
optimizing for **less code and easier maintenance under a single-user blog**.
They started from one question — "is the `rank`-based reordering the best way?"
— and fanned out into the schema underneath it. **All three are resolved: two
shipped and one was declined**; the section is kept because the reasoning for
the *order* they were taken in is what made the third decidable on evidence.

The order they were read in:

| # | Plan                                                       | Owns                                                                                       | Churn        |
| - | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------ |
| 1 | [archive/ordering-simplification.md](./archive/ordering-simplification.md) | ~~Replace fractional `rank` with an ordered id array per container~~ — **done, all 5 phases, 30 Aug 2026** | Low–moderate |
| 2 | [schema-organization.md](./schema-organization.md)         | ~~Idiomatic schema cleanup (timestamptz, real FKs, enums, dead-field/index removal, renames)~~ — **done, all 4 phases, 31 Aug 2026** | Low–moderate |
| 3 | [archive/series-as-node.md](./archive/series-as-node.md)   | ~~Fold `Series` into the `Document` node tree so ordering is one `childOrder` mechanism~~ — **declined 31 Aug 2026, never built** | High |

Plans 1 and 2 were complementary and largely independent. Plan 3 was the
_unifying end state_ that subsumed parts of both, and taking it last is what
killed it: by the time it was decidable, plan 1 had delivered its ordering
payoff without it.

---

## The core trade, and how it resolved

- **Plans 1 + 2** got ~90% of the ordering simplification (delete fractional
  indexing, one array per container) at low blast radius — leaving a
  permanently **polymorphic root array** and the whole `Series` subsystem in
  place. Both shipped.
- **Plan 3** would have designed the two-table root problem _out_ (everything
  one node, root order homogeneous, one `moveNode`, one `childOrder`) — at the
  cost of a genuine domain refactor. **Declined.** Re-costing it against the
  finished base (`archive/series-as-node.md` §9) found the ordering half of the
  prize already collected: `repositories/ordering.ts` is container-parameterised
  today, and only ~55 lines of *move* code are doubled. The root array stays
  polymorphic, and `src/lib/orderArray.ts` absorbs that — it takes ids, not
  rows.

## Recommended sequencing

Land the small, safe work first; sequence the high-churn unification **last**,
on top of an already-simplified base — never all at once.

**Steps 1–5 have all shipped** — 1, 2, 3 and 5 on 30 Aug 2026, step 4 on 31 Aug.
That is the whole of Plans 1 and 2; only the step 6 decision is left. Struck
text below is done; it is kept because the reasoning for the *order* still
reads.

1. ~~**Schema Phase A — the safe sweep** (from Plan 2): `timestamptz` everywhere,
   drop OAuth1 columns, drop redundant `[authorId]` indexes, `role` → enum. Pure
   DB / no app-logic change. Ship it independently.~~ — **done**, and "no
   app-logic change" turned out to be false; see that plan's §6.

2. ~~**Ordering, Phases 1–3** (from Plan 1): add order-array columns, backfill
   from `rank`, switch _reads_ to the arrays + tolerant `orderBy`. Order is now
   array-driven for reads while writes still go through `rank` — safe cutover
   point. This also fixes the latent bug where grouped/time views still sort by
   `createdAt`.~~ — **done**; the arrays are four, not three, and the safety of
   this step depended on a dual write the plan does not mention.

3. ~~**Ordering, Phase 4 — write cutover** (from Plan 1): new order endpoints +
   thunks, UI drag/menu builds id arrays, remove the `between`/bracketing
   plumbing.~~ — **done**, four endpoints rather than three.

4. ~~**Schema Phases B–D** (from Plan 2): `head` → real FK, `name → title` /
   `background_image → backgroundImage` renames, drop dead `type`/coauthors.
   Coordinate Phase D with the next step (both touch `Document` indexes).~~ —
   **done**, with two departures the author made at the time: coauthors were
   *kept*, and `background_image` was dropped rather than renamed.

5. ~~**Ordering, Phase 5 — delete `rank`** (from Plan 1): drop the `rank`
   columns/indexes, the `fractional-indexing` dep, `lib/ordering.ts`,
   `lib/documentOrder.ts`, most of `repositories/ordering.ts`.~~ — **done**, and
   it took the local library with it: IndexedDB orders by array now too, so
   there is one ordering mechanism in the codebase rather than two.

   → The two-plan approach is **complete**, and step 6 below was the optional
   third that never ran.

6. ~~**Series-as-node** (Plan 3): project each `Series` row into a
   `kind = SERIES` `Document` (preserving id), repoint posts' `parentId`, fold
   the three order arrays into one `childOrder`, collapse the `series` Redux
   slice into a node selector, retire `repositories/series.ts` and
   `/api/series/*`.~~ — **declined 31 Aug 2026.** Sequencing it last is what
   made it decidable on measurement rather than on the estimate it was written
   with, and the measurement went against it.

## Decisions locked

- Ordering model: **ordered id array per container** (not fractional rank, not
  integer position). Re-home = move + append; a follow-up order write positions.
- Content model: **single self-referential `Document` node** with a clean
  identity (keep the model name, drop the vestigial `type`).
- Cleanup scope: timestamptz everywhere · `head` → real FK · `role`/status enums
  · delete dead fields · drop redundant indexes · rename for consistency.

## Decisions taken

Both of the questions this section carried are answered; **nothing here is
open.**

- ~~**Drop `DocumentCoauthors` + `collab` entirely?**~~ **Declined 31 Aug 2026.**
  They stay as a placeholder for collaborative editing, against Plan 2 §5's own
  recommendation. If it is ever revived, re-key on `User.id`, not `userEmail`.
- ~~**Commit to Plan 3 (Series-as-node)?**~~ **Declined 31 Aug 2026** — see
  the Answered section above and `archive/series-as-node.md` §10.
- ~~`timestamptz` backfill assumes stored values are UTC; confirm before the
  cast.~~ **Confirmed and done** — the evidence is in
  `schema-organization.md` §6.
