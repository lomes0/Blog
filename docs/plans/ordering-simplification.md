# Ordering simplification plan

**Goal:** replace the fractional-index (`rank`) ordering machinery with the
simplest thing that supports manual drag/menu reorder, optimizing for **less
code and easier maintenance**. Single-user is an accepted assumption — we drop
the multi-client / offline-collision robustness the current design pays for.

Status: proposal. Nothing implemented yet. Current ordering lives on branch
`feat/manual-ordering` (commits `52a1442d`…`de53f4aa`).

---

## 1. Why the current design feels heavy

Manual ordering today is fractional indexing (LexoRank-style): every orderable
row stores a `rank` string; a reorder writes one key *between* its neighbours.
It's the industry-standard primitive and it works — but for a single-user blog
it carries a lot of machinery whose only justification is properties we don't
need (offline concurrent reorder, no-renumber writes at scale):

| Concern (single-user) | Cost it imposes today |
|---|---|
| Fractional keys | `fractional-indexing` dep, `src/lib/ordering.ts` (100 L) + `src/lib/documentOrder.ts` (64 L) |
| C-collation (byte-order compare) | 2 migrations, `COLLATE "C"` on `Document.rank` + `Series.rank`, a whole class of "why is order wrong" bugs |
| Root list spans **two tables** | `Document.rank` and `Series.rank` share one keyspace but live in separate tables → `maxRank` scans both, order is merged in JS, can't `ORDER BY rank` |
| Deterministic client re-derivation | client recomputes the *same* rank the server will, to stay in sync: `moveRank`, `containerSiblings`, `applyDocumentRank`, `applySeriesRank` |
| `between`/`afterRank`/`beforeRank` plumbing | `ranksBracketing` translates up/down/top/bottom → neighbour ranks, threaded through API → client → thunks |
| Re-home bookkeeping | `reRankIntoRoot`, cycle detection, exclusive-container rank minting in `repositories/ordering.ts` (218 L) |

The two-table shared keyspace is the specific thing that makes the root list
awkward, and the deterministic client/server rank duplication is the specific
thing that makes it verbose.

---

## 2. Chosen model: an explicit order array on each container

Store order as an ordered `String[]` of child ids **on the container that owns
the list**. A reorder rewrites one array. Reads order children by their index
in it.

| Container | Owns array | Contents |
|---|---|---|
| Author root list | `User.rootOrder String[]` | mixed: standalone document ids **and** series ids |
| A series' posts | `Series.postOrder String[]` | document ids of that series' posts |
| A tabbed post | `Document.tabOrder String[]` | child document ids of that parent |

Why this over the alternatives, on the "least code / easiest to maintain" axis:

- **vs. keeping fractional `rank`:** deletes the fractional lib, both collation
  migrations, all neighbour-rank math, and the deterministic client/server
  re-derivation. The reorder payload becomes "here is the new order" — the
  client sends the literal array it already rendered; the server persists it
  verbatim. No math on either side.
- **vs. integer `position` per row:** a `position Int` column keeps the row
  self-describing (nice) but **keeps the two-table root problem** — root order
  would still be split across `Document.position` and `Series.position` and
  need a JS merge. The array puts root order in **one field on `User`**, so the
  merge disappears. That's the single biggest simplification, so the array wins.
- **vs. unifying `Document` + `Series` into one node table:** cleanest in
  theory but a large migration touching every read. Not worth it for a
  single-author root list.

Trade-off we accept: a reorder rewrites the whole array (fine for one user's
small lists), and the array can drift from the rows (an id for a deleted row, or
a new row missing from the array). We make the reader tolerant so drift is
cosmetic and self-heals on the next write (see §6).

---

## 3. Schema changes

```prisma
model User {
  // ...
  rootOrder String[] @default([])   // interleaved standalone-document + series ids
}

model Series {
  // ...
  // rank String        ← remove
  postOrder String[] @default([])   // ordered post (document) ids
}

model Document {
  // ...
  // rank String        ← remove
  tabOrder String[] @default([])    // ordered child (tab) document ids; empty for non-parents
}
```

Drop these indexes (no longer meaningful): `Document @@index([seriesId, rank])`,
`@@index([parentId, rank])`, `@@index([authorId, rank])`,
`Series @@index([authorId, rank])`. No collation on `String[]`.

---

## 4. Server changes

`repositories/ordering.ts` (218 L) collapses to a small module whose only jobs
are: write a container's order array, and keep membership arrays in sync when a
document is created / deleted / re-homed.

```
setRootOrder(userId, ids)                 // validate ids belong to the user, write User.rootOrder
setSeriesOrder(seriesId, ids)             // validate ids are posts of the series, write Series.postOrder
setTabOrder(parentId, ids)                // validate ids are children of the parent, write Document.tabOrder
moveDocument(id, { seriesId|parentId })   // re-home: null out old container, set new; fix both arrays
```

Endpoints:

- **Reorder within a container** — replace the per-item `.../move` with a single
  order write per container:
  - `PATCH /api/users/me/root-order  { orderedIds: string[] }`
  - `PATCH /api/series/[id]/order    { orderedIds: string[] }`
  - `PATCH /api/documents/[id]/tab-order { orderedIds: string[] }`
  Each validates ownership + that every id is a legal member, then writes the
  array. No `between`, no rank.
- **Re-home a document** (into/out of a series or tab-group):
  `PATCH /api/documents/[id]/move { destination: { seriesId|parentId } }`,
  no `between`. **Decided: re-home appends only.** The endpoint moves the doc,
  removes its id from the source array, and appends it to the destination
  array. If the user dropped it at a specific slot, the client follows with a
  normal order write (`PATCH .../order`) to position it. Two small calls, no
  combined position payload.

Delete `moveSeriesTx`/`moveDocumentTx` transaction wrappers in favor of the
`setXOrder` writes; the array writes are single-row updates and don't need the
two-table transaction.

---

## 5. Client / store changes

Delete the deterministic rank machinery — it exists only to keep client and
server computing identical fractional keys:

- Remove `src/lib/ordering.ts`, `src/lib/documentOrder.ts` (`ranksBracketing`,
  `compareDocumentsByRank`, `rankOf`), and the `fractional-indexing` dep.
- In `documentThunks.ts`: delete `moveRank`, `containerSiblings`,
  `applyDocumentRank`; in `seriesThunks.ts`: delete `applySeriesRank`,
  `rankBetween` usage.
- Reorder thunk becomes: compute the new ordered-id array in the reducer/handler
  (a trivial array splice/swap of ids the UI already holds), set it optimistically
  in the store, and `PATCH` it. No rollback logic needed beyond re-fetch on error.

Read/sort path:

- Replace rank comparators (`byRank`, `compareDocumentsByRank`, the inline
  comparators in `PostsListView`, `seriesGrouping`, `sortDocuments`) with a
  single helper `orderBy(ids: string[], rows)` that returns rows sorted by their
  index in `ids`, appending any row not in `ids` at the end (see §6).
- `PostsListView` root list: order the interleaved standalone-docs + series by
  `User.rootOrder` instead of merging two rank spaces. Drag handlers build the
  new id array and call the order thunk.

**Also fixes the latent bug:** `seriesGrouping.ts`
(`groupPostsBySeries`, `deduplicateSeriesAcrossPartitions`) currently still sorts
by `createdAt`, so manual order doesn't show in grouped/time-partitioned views.
Routing every surface through `orderBy(...)` closes that gap.

---

## 6. Edge cases & drift handling (the tolerant reader)

One helper keeps arrays and rows from ever producing a broken view:

```ts
// Order `rows` by their id's index in `order`; ids missing from `order`
// (newly created, or never ordered) fall to the end by createdAt; ids in
// `order` with no row (deleted) are ignored.
function orderBy<T extends { id: string; createdAt?: string }>(order: string[], rows: T[]): T[]
```

- **Create:** append the new id to its container's array (`rootOrder` /
  `postOrder` / `tabOrder`). Even if we forget, the tolerant reader shows it last
  — no crash.
- **Delete:** filter the id out of its container's array. Even if we forget, the
  reader ignores unknown ids.
- **Re-home:** `moveDocument` removes the id from the source array and appends to
  the destination array in one transaction.
- **Backfill safety:** arrays default to `[]`; an empty array means "fall back to
  createdAt order," which is exactly today's pre-rank behavior.

Centralize create/delete/move array maintenance in the `setXOrder` /
`moveDocument` repo functions so bookkeeping lives in one place.

---

## 7. Local (IndexedDB) side

Mirror the paired local/cloud pattern with far less code, since there's no rank
math to duplicate:

- Local root order → a single settings/keyval record in IndexedDB
  (`rootOrder: string[]`), analogous to `User.rootOrder`.
- Local series/tab order → `postOrder` / `tabOrder` arrays on the local Series /
  Document records.
- Reorder of a local-only item just rewrites the local array. No deterministic
  cross-store rank agreement needed — each store owns its array; the merged view
  orders by the cloud array when present, else the local array.

`types.ts`: replace `rank?: string | null` on the document/series types with the
relevant `*Order?: string[]` fields on their containers.

---

## 8. Migration & rollout (phased, each independently shippable)

1. **Add arrays (additive).** Migration adds `User.rootOrder`, `Series.postOrder`,
   `Document.tabOrder`, all `@default([])`. Keep `rank` for now.
2. **Backfill.** Rewrite `prisma/scripts/backfill-ranks.ts` → `backfill-order.ts`:
   for each container, read rows in current `rank` order and write the id array.
   Idempotent, `--dry` supported (same shape as the existing script).
3. **Switch reads.** Point every sort surface at `orderBy(...)` + the arrays.
   Ship and verify order is visually identical to rank order.
4. **Switch writes.** New order endpoints + thunks; UI drag/menu handlers build
   id arrays. Remove `between`/bracketing plumbing.
5. **Delete rank.** Migration drops `Document.rank`, `Series.rank`, their indexes
   and the two collation migrations' columns; remove `src/lib/ordering.ts`,
   `documentOrder.ts`, most of `repositories/ordering.ts`, and the
   `fractional-indexing` dependency. Update `src/lib/__tests__/ordering.test.ts`.

Steps 1–3 are safe to land while writes still go through rank; the cutover is
step 4. Roll back by reverting step 4 (rank columns still populated until 5).

---

## 9. Net effect

**Deleted:** `fractional-indexing` dep · `lib/ordering.ts` (100 L) ·
`lib/documentOrder.ts` (64 L) · ~150 L of `repositories/ordering.ts` ·
`moveRank`/`containerSiblings`/`applyDocumentRank`/`applySeriesRank` ·
`ranksBracketing` and all `between`/`afterRank`/`beforeRank` plumbing ·
2 collation migrations · 4 rank indexes · the two-table root merge.

**Added:** 3 array columns · one `orderBy` reader · 3 thin `setXOrder` writers ·
3 order endpoints.

**Also fixed:** manual order now shows in grouped/time-partitioned post views.

---

## 10. Open questions

- Root array holds mixed document + series ids; resolve each by lookup
  (id in documents → standalone doc, id in series → series group). Confirm no
  id collision is possible across the two id spaces (both are UUIDs → fine).
- ~~Re-home vs. position in one call?~~ **Decided:** keep re-home separate;
  it appends on arrival, a follow-up order write positions it (see §4).
- Keep `authorId` scoping on everything (cheap) even under the single-user
  assumption, so a future multi-user story isn't blocked.
```
