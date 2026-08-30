# Ordering simplification plan

**Goal:** replace the fractional-index (`rank`) ordering machinery with the
simplest thing that supports manual drag/menu reorder, optimizing for **less
code and easier maintenance**. Single-user is an accepted assumption — we drop
the multi-client / offline-collision robustness the current design pays for.

Status: **all five phases implemented, 30 Aug 2026.** The order arrays are the
only ordering mechanism in the codebase. They exist, are backfilled, are what
every read sorts by and what every write writes, on both sides of the storage
seam — `rank` and its indexes are dropped, `src/lib/ordering.ts`,
`src/lib/documentOrder.ts` and the `fractional-indexing` dependency are gone,
and the local (IndexedDB) library is on arrays too (§7). The phase log in §11
records everything below this line that the tree has since made false — read it
before trusting a section.

---

## 1. Why the current design feels heavy

Manual ordering today is fractional indexing (LexoRank-style): every orderable
row stores a `rank` string; a reorder writes one key _between_ its neighbours.
It's the industry-standard primitive and it works — but for a single-user blog
it carries a lot of machinery whose only justification is properties we don't
need (offline concurrent reorder, no-renumber writes at scale):

| Concern (single-user)                       | Cost it imposes today                                                                                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fractional keys                             | `fractional-indexing` dep, `src/lib/ordering.ts` (100 L) + `src/lib/documentOrder.ts` (64 L)                                                          |
| C-collation (byte-order compare)            | 2 migrations, `COLLATE "C"` on `Document.rank` + `Series.rank`, a whole class of "why is order wrong" bugs                                            |
| Root list spans **two tables**              | `Document.rank` and `Series.rank` share one keyspace but live in separate tables → `maxRank` scans both, order is merged in JS, can't `ORDER BY rank` |
| Deterministic client re-derivation          | client recomputes the _same_ rank the server will, to stay in sync: `moveRank`, `containerSiblings`, `applyDocumentRank`, `applySeriesRank`           |
| `between`/`afterRank`/`beforeRank` plumbing | `ranksBracketing` translates up/down/top/bottom → neighbour ranks, threaded through API → client → thunks                                             |
| Re-home bookkeeping                         | `reRankIntoRoot`, cycle detection, exclusive-container rank minting in `repositories/ordering.ts` (218 L)                                             |

The two-table shared keyspace is the specific thing that makes the root list
awkward, and the deterministic client/server rank duplication is the specific
thing that makes it verbose.

---

## 2. Chosen model: an explicit order array on each container

Store order as an ordered `String[]` of child ids **on the container that owns
the list**. A reorder rewrites one array. Reads order children by their index in
it.

| Container        | Owns array                   | Contents                                          |
| ---------------- | ---------------------------- | ------------------------------------------------- |
| Author root list | `User.rootOrder String[]`    | mixed: standalone document ids **and** series ids |
| A series' posts  | `Series.postOrder String[]`  | document ids of that series' posts                |
| A tabbed post    | `Document.tabOrder String[]` | child document ids of that parent                 |

Why this over the alternatives, on the "least code / easiest to maintain" axis:

- **vs. keeping fractional `rank`:** deletes the fractional lib, both collation
  migrations, all neighbour-rank math, and the deterministic client/server
  re-derivation. The reorder payload becomes "here is the new order" — the
  client sends the literal array it already rendered; the server persists it
  verbatim. No math on either side.
- **vs. integer `position` per row:** a `position Int` column keeps the row
  self-describing (nice) but **keeps the two-table root problem** — root order
  would still be split across `Document.position` and `Series.position` and need
  a JS merge. The array puts root order in **one field on `User`**, so the merge
  disappears. That's the single biggest simplification, so the array wins.
- **vs. unifying `Document` + `Series` into one node table:** cleanest in theory
  but a large migration touching every read. Not worth it for a single-author
  root list.

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
  - `PATCH /api/documents/[id]/tab-order { orderedIds: string[] }` Each
    validates ownership + that every id is a legal member, then writes the
    array. No `between`, no rank.
- **Re-home a document** (into/out of a series or tab-group):
  `PATCH /api/documents/[id]/move { destination: { seriesId|parentId } }`, no
  `between`. **Decided: re-home appends only.** The endpoint moves the doc,
  removes its id from the source array, and appends it to the destination array.
  If the user dropped it at a specific slot, the client follows with a normal
  order write (`PATCH .../order`) to position it. Two small calls, no combined
  position payload.

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
  (a trivial array splice/swap of ids the UI already holds), set it
  optimistically in the store, and `PATCH` it. No rollback logic needed beyond
  re-fetch on error.

Read/sort path:

- Replace rank comparators (`byRank`, `compareDocumentsByRank`, the inline
  comparators in `PostsListView`, `seriesGrouping`, `sortDocuments`) with a
  single helper `orderBy(ids: string[], rows)` that returns rows sorted by their
  index in `ids`, appending any row not in `ids` at the end (see §6).
- `PostsListView` root list: order the interleaved standalone-docs + series by
  `User.rootOrder` instead of merging two rank spaces. Drag handlers build the
  new id array and call the order thunk.

**Also fixes the latent bug:** `seriesGrouping.ts` (`groupPostsBySeries`,
`deduplicateSeriesAcrossPartitions`) currently still sorts by `createdAt`, so
manual order doesn't show in grouped/time-partitioned views. Routing every
surface through `orderBy(...)` closes that gap.

---

## 6. Edge cases & drift handling (the tolerant reader)

One helper keeps arrays and rows from ever producing a broken view:

```ts
// Order `rows` by their id's index in `order`; ids missing from `order`
// (newly created, or never ordered) fall to the end by createdAt; ids in
// `order` with no row (deleted) are ignored.
function orderBy<T extends { id: string; createdAt?: string }>(
  order: string[],
  rows: T[],
): T[];
```

- **Create:** append the new id to its container's array (`rootOrder` /
  `postOrder` / `tabOrder`). Even if we forget, the tolerant reader shows it
  last — no crash.
- **Delete:** filter the id out of its container's array. Even if we forget, the
  reader ignores unknown ids.
- **Re-home:** `moveDocument` removes the id from the source array and appends
  to the destination array in one transaction.
- **Backfill safety:** arrays default to `[]`; an empty array means "fall back
  to createdAt order," which is exactly today's pre-rank behavior.

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

1. **Add arrays (additive).** Migration adds `User.rootOrder`,
   `Series.postOrder`, `Document.tabOrder`, all `@default([])`. Keep `rank` for
   now.
2. **Backfill.** Rewrite `prisma/scripts/backfill-ranks.ts` →
   `backfill-order.ts`: for each container, read rows in current `rank` order
   and write the id array. Idempotent, `--dry` supported (same shape as the
   existing script).
3. **Switch reads.** Point every sort surface at `orderBy(...)` + the arrays.
   Ship and verify order is visually identical to rank order.
4. **Switch writes.** New order endpoints + thunks; UI drag/menu handlers build
   id arrays. Remove `between`/bracketing plumbing.
5. **Delete rank.** Migration drops `Document.rank`, `Series.rank`, their
   indexes and the two collation migrations' columns; remove
   `src/lib/ordering.ts`, `documentOrder.ts`, most of
   `repositories/ordering.ts`, and the `fractional-indexing` dependency. Update
   `src/lib/__tests__/ordering.test.ts`.

Steps 1–3 are safe to land while writes still go through rank; the cutover is
step 4. Roll back by reverting step 4 (rank columns still populated until 5).

---

## 9. Net effect

**Deleted:** `fractional-indexing` dep · `lib/ordering.ts` (100 L) ·
`lib/documentOrder.ts` (64 L) · ~150 L of `repositories/ordering.ts` ·
`moveRank`/`containerSiblings`/`applyDocumentRank`/`applySeriesRank` ·
`ranksBracketing` and all `between`/`afterRank`/`beforeRank` plumbing · 2
collation migrations · 4 rank indexes · the two-table root merge.

**Added:** 3 array columns · one `orderBy` reader · 3 thin `setXOrder` writers ·
3 order endpoints.

**Also fixed:** manual order now shows in grouped/time-partitioned post views.

---

## 10. Open questions

- Root array holds mixed document + series ids; resolve each by lookup (id in
  documents → standalone doc, id in series → series group). Confirm no id
  collision is possible across the two id spaces (both are UUIDs → fine).
- ~~Re-home vs. position in one call?~~ **Decided:** keep re-home separate; it
  appends on arrival, a follow-up order write positions it (see §4).
- Keep `authorId` scoping on everything (cheap) even under the single-user
  assumption, so a future multi-user story isn't blocked.

---

## 11. Phase log

### 30 Aug 2026 — phases 1-3

Shipped: the four order-array columns, the backfill that seeds them from `rank`,
and every read switched to them through one tolerant reader
(`src/lib/orderArray.ts`, spec beside it). Verified against the dev database:
all 54 containers came out byte-identical to their rank order, and the app
serves a series' posts in exactly `postOrder`.

**Where this document was already wrong.** It was written 30 Jul 2026 and the
tree moved under it:

1. **§2's table misses a container.** `Project` both sits in the author's root
   list on the shared rank space *and* owns the order of its member series
   (`Series @@index([projectId, rank])`). So there are **four** arrays, not
   three — `Project.seriesOrder String[]` is the fourth — and `User.rootOrder`
   interleaves ids from three tables (documents, series, projects), not two.
   §10's first open question is answered the same way and stays answered: all
   three ids are v4 UUIDs minted by separate `@default(uuid())` columns, so an
   id resolves to at most one row.
2. **§5's list of sort surfaces is stale.** `src/lib/tree/` (27 Aug) put
   `groupRootItems` / `rootItemsToTreeNodes` behind *both* the sidebar and
   /posts, so "the inline comparators in PostsListView" is now one shared
   builder. The real set is in the phase-3 notes below.
3. **§5's "also fixes the latent bug" is already fixed.** `seriesGrouping.ts`
   stopped sorting by `createdAt` when manual ranks landed; it sorted by rank
   before this phase and by the arrays after it. There is no gap left to close.
4. **§8 step 2's script no longer compiles.** `prisma/scripts/backfill-ranks.ts`
   reads `sort_order` and `seriesOrder`, columns dropped by
   `20260703162638_drop_legacy_order_fields`. It is replaced rather than edited:
   `prisma/scripts/backfill-order.ts`, `pnpm order:backfill [--dry]`.
5. **§7 is not reachable from this phase.** The local side is posts only —
   series and projects are cloud-only, and IndexedDB has no `User` row to hang a
   `rootOrder` on. It therefore stays on `rank`, and the two places that know
   this are named in the phase-3 notes.
6. **§8's "steps 1-3 are safe while writes still go through rank" is false as
   stated.** Once reads come from the arrays, a reorder that writes only a rank
   leaves the array stale and the reorder appears to do nothing — the tolerant
   reader falls back to `createdAt`, never to rank. Resolved by dual-writing;
   see below.

**The dual write (what phase 4 has to delete).** Every rank write is now
followed by a recompute of the container's array from the rank order, in the
same transaction:

- server: `syncOrder(db, container)` in `src/repositories/ordering.ts`, called
  from `movePost`, `moveSeries`, `moveProject`, `reRankIntoRoot`,
  `reRankSeriesIntoRoot`, and from the create/delete paths in the document,
  series and project repositories. `resyncAuthorOrder` does a whole author at
  once, for the import route.
- client: `syncOrderArrays(state)` in `src/store/orderSync.ts`, run by one
  matcher in `src/store/app.ts` over every rank-writing action — the optimistic
  `apply*Rank` actions and the move/create/delete `fulfilled` cases. Without it
  a drag would not move on screen until the next full load, because the store's
  copy of the arrays is not what the move response returns.

Phase 4 deletes the rank half of each pair rather than adding an array half:
`syncOrder` becomes the `setXOrder` writers of §4, and `syncOrderArrays`
disappears entirely once the client sends the array it already rendered.

**Reads switched (the real §5 list).** Server: the four series queries in
`repositories/series.ts` (their nested `orderBy: { rank }` is gone — SQL cannot
sort by an array on the parent, so `orderedPosts` does it in one pass),
`findProjectsByAuthorId`, `findDocumentChildren`, and `authorSeries` in
`src/lib/mcp/server.ts`. Client: `seriesGrouping.ts` (`groupRootItems` now takes
the container's order array, a project's children come from
`Project.seriesOrder`, a series' posts from `Series.postOrder`,
`seriesPositionOf` likewise), `selectChildPostsByParent` and the new
`selectRootOrder` in `store/selectors/layoutSelectors.ts`, `PostsView`,
`PostsListView` (new `rootOrder` prop, pairing with the existing
`rootContainer`), the sidebar, and `useSeriesGroupState`. `User.rootOrder`
reaches the client on the session — `session.user` is the `User` row, so no
route had to be invented.

Still on rank, deliberately: everything that *writes* order —
`src/lib/ordering.ts`, `src/lib/documentOrder.ts` (`ranksBracketing`,
`bracketForDrop`), `lib/tree/model.ts`'s `TreeNode.rank`, `useTreeDnd`, the
`between` plumbing through the move routes and thunks — plus the local
(IndexedDB) backend, which is phase 4+ work per §7.

### 30 Aug 2026 — phase 4 (the write cutover)

Shipped: four order endpoints, the drag and menu handlers rewritten to build id
arrays, and **both halves of the phase-3 dual write deleted**. Nothing computes
a position on either side of the wire any more: the client sends the array it
already rendered and the server stores it verbatim.

**`rank` on the create path, deliberately.** `Document.rank`, `Series.rank` and
`Project.rank` are `NOT NULL`, so every insert still has to write something. Of
the three options — keep minting an append key, make the column nullable now, or
give it a default — the first was chosen. Making it nullable is a migration
phase 5 immediately reverses, and it breaks the rollback: reverting phase 4 onto
rows with a null rank would order them by nothing. So `rankForAppend`,
`rankForPrepend` and `rankForAppendSeries` survive, `freeIntoRoot` /
`freeSeriesIntoRoot` still mint a batch for rows a delete frees into root, and
**no reorder writes a rank and no read consults one**. `src/lib/ordering.ts`
therefore survives in reduced form (`rankAtEnd` is gone — nothing appends
client-side any more), and so does `src/lib/documentOrder.ts`, cut to `rankOf` +
`comparePostsByRank` for the local (IndexedDB) library, which §7 leaves on rank.

**Where this document is *still* wrong, on top of the phases 1-3 list.**

7. **§4 names three endpoints; there are four.** Same omission as §2's table —
   `Project.seriesOrder` needs its own. The set is
   `PATCH /api/users/me/root-order`, `/api/series/[id]/order`,
   `/api/projects/[id]/order`, `/api/documents/[id]/tab-order`.
8. **§4's `setXOrder(...)` signatures are the wrong shape.** They read as pure
   writers; each is really a validated write, because the body is a *list of
   ids* and that is the shape that invites checking only the first one. One
   function does it: `setOrder(db, container, ids)` over an `OrderContainer`,
   with `orderMemberIds` answering for the whole set in one query per table.
9. **§4's `moveProject` has nothing left to do.** A project only ever lives at
   root, so it has no container to change; reordering one is a root-order write
   like any other row's. `PATCH /api/projects/[id]/move`, the `moveProject`
   thunk and `applyProjectRank` are deleted outright rather than converted.
10. **§8's rollback line ("roll back by reverting step 4") holds, but only
    because of the create-path decision above.** Had the ranks stopped being
    minted, a revert would have found rows with no key at all.

**Refusals (§4 "validates ownership + that every id is a legal member").** The
container is proven the caller's first — `requireOwnedSeries`,
`requireOwnedProject`, `requireDocument(..., "own")`, or the session itself for
root — and then every id in the body is checked against that container's live
membership. A **foreign** id is refused (400): it is never a race, it is a
caller reaching into another list, and accepting it would adopt the row. A
**repeated** id is refused (400): the tolerant reader silently collapses a
duplicate to its first mention, so accepting one would hide the bug that made
it. A **missing** member is *accepted*, and `setOrder` appends the unnamed
members in their existing relative order rather than dropping them — a client
sends the list it rendered, which can legitimately lag by a row created in
another tab, and rejecting would make every reorder in that window fail.

**Re-home is two calls, and it does not flicker.** The drop handler computes the
destination's finished array, dispatches `applyOrder` into the store *before*
either request, then re-homes (which appends server-side) and then writes the
order. The row is therefore drawn at the slot it was dropped on from the first
frame. If the second call fails the first has already landed: the row is in its
new container but at the end of it, the failure is announced, and the next load
settles it — the same no-rollback bargain the rank-era optimistic reorder made.

**A tab-order write pins `updatedAt`.** The other three containers are the
list's *owner* (a user, a series, a project), for which "its order changed" is a
change to the row. A tabbed post is not: `@updatedAt` would have pushed it to
the top of every recency-sorted list because someone dragged a tab.

**Deleted, against §5's list.** `syncOrder` / `syncOrders` / `resyncAuthorOrder`
(server) and `src/store/orderSync.ts` plus its `app.ts` matcher (client) — the
whole dual write. `moveRank`, `containerSiblings`, `applyPostRank`,
`applySeriesRank`, `applyProjectRank`, `ranksBracketing`, `bracketForDrop`,
`RankedSibling`, `rankAtEnd`, `TreeNode.rank`, `rootItemRank`, the `between`
plumbing through `MovePostArg` / the API types / the two move routes, the
project move route and thunk, and `PostBackend.move`'s `rank` argument.
**Survived**, with reasons: `src/lib/ordering.ts` and
`src/lib/documentOrder.ts` (above), and `compareRankThenId`, which
`prisma/scripts/backfill-order.ts` still needs.

**Added.** `src/lib/orderMove.ts` — `moveByDirection`, `moveToTarget`,
`applySubsetOrder` — the whole of what a reorder now computes, import-free and
specced beside itself (`orderMove.test.ts`, 18 cases). `applySubsetOrder` is the
one that is not obvious: the root list is one array rendered as two sections, so
a menu reorder inside a section writes its rows back into the slots the section
already occupied, leaving the other section's rows where they are. That is what
bracketing a rank against the section used to buy. `src/app/api/orderWrite.ts`
holds the shared `.strict()` body schema and the one refusal path.
`src/store/thunks/orderThunks.ts` holds `applyOrder` (paint) and `setOrder`
(persist); `app.ts` gained explicit `addToStoreOrder` / `removeFromStoreOrder` /
`forgetFromOrders`, because with no ranks to derive from, the store maintains
its arrays the same way the server does.

**The local backend is a `reorder` on the seam now.** `PostBackend.reorder`
takes the array; the cloud backend does nothing (order is written per container,
by a container the post-only seam could not address), and the local one rewrites
the posts' ranks to match the array and hands them back for the store. So the
*interface* is already phase-4 shaped while IndexedDB stays on `rank` per §7.

**One asymmetry worth knowing.** A surface that does not render projects draws
their member series inline at root, so a root reorder there can name a series
that is really a project's — not a root member, and the endpoint refuses it. The
`setOrder` thunk drops those ids before sending, which lands the rest of the
gesture and leaves the invisible filing alone. That is exactly what
`rendersProjects` already promised; the server check stays the guarantee.

**Verified.** All four gestures in a real browser (`BUILD_DIR=.next-verify pnpm
dev -p 3005`, sidebar drag, session cookie), each checked in Postgres: a root
reorder (one `PATCH /api/users/me/root-order`, and `rootOrder` matches the
screen), a within-series reorder (one `/api/series/[id]/order`), a cross-series
drag (two
calls in order — `/move` then `/order` — the id added to the destination *at the
dropped slot* and removed from the source), and a multi-select drag (two rows
land as one contiguous block, one root-order write). Every endpoint exercised
directly including its refusals: 400 foreign, 400 duplicate, 400 unknown key,
400 non-uuid, 400 malformed JSON, 403 another author's container, 404 missing,
401 signed out. Create / re-home / delete array bookkeeping exercised end to end
(`placement: "start"` prepends; a deleted series leaves `rootOrder` and its
posts join the end of it). Every row touched was restored, and the tables are
byte-identical to the pre-change dump.

### 30 Aug 2026 — phase 5 (`rank` is gone)

Shipped: the migration that drops `Document.rank`, `Series.rank`,
`Project.rank` and their indexes; the create path, which was the last thing
minting a key; `src/lib/ordering.ts`, `src/lib/documentOrder.ts`,
`prisma/scripts/backfill-order.ts` and the `fractional-indexing` dependency; and
**§7**, the local side, which phases 3 and 4 both deferred. There is now one
ordering mechanism in the tree — an ordered array of child ids on the container
— on both sides of the storage seam.

**§7 was done properly rather than worked around.** The alternative was keeping
`rank` as a local-only field: Postgres loses the column, IndexedDB keeps it.
That was rejected — it leaves two ordering mechanisms and keeps the dependency,
which is the duplication this plan exists to remove — and the reason §11 entry 5
gave for deferring turned out to be about *where the array lives*, not about
whether one can. So:

- A tabbed post's order is `tabOrder` **on the post record**, exactly as it is a
  column on `Document` in the cloud. That is what lets
  `selectChildPostsByParent` lose its session branch entirely: `tabOrder` is a
  field of the post in both libraries.
- Root is the one container whose owner is not a row both libraries have. The
  cloud hangs it on `User` and it arrives on the session; IndexedDB has no user,
  so a guest's is a keyval record in a new `orders` store
  (`{ id: "root", ids }`, database version 8), read once by `loadRootOrder` and
  held in
  `AppState.guestRootOrder`. `selectRootOrder` still branches, but on *which
  storage the session uses*, not on arrays-versus-ranks.
- `PostBackend.reorder` now takes the container and returns nothing. It used to
  hand back freshly minted ranks for the store to apply, which is why
  `applyLocalRanks` existed; there is nothing to hand back when both sides store
  the array verbatim, so that action and the guest branch in the `setOrder`
  thunk are both gone. The cloud backend picks the endpoint by container kind,
  which moved the last `apiClient` call out of the thunk.

**Where this document is *still* wrong, on top of the phases 1-4 list.**

11. **§3 says "drop these indexes" and lists four; there are six.** The same
    omission as §2's table and §4's endpoint list — `Project @@index([authorId,
    rank])` is missing, and so is `Series @@index([projectId, rank])`. The
    migration names all six.
12. **§9 says "2 collation migrations"; there is one.**
    `20260630013820_rank_c_collation` covers both columns in one file, and
    `Project.rank` was never collated at all — it was added later and nothing
    ever compared it as a byte string. Nothing was reverted either way: an
    applied migration is checksummed, so phase 5 adds a new one that drops the
    columns the old one typed.
13. **Dropping the columns leaves `Document.parentId` unindexed.** Its only
    index was the composite with `rank`, and "the children of this post" is a
    live query (`findDocumentChildren`, every tab strip). The migration replaces
    it with a plain `@@index([parentId])`. The other two Document composites had
    a leading-column index already (`Document_seriesId_idx`, and
    `Document_authorId_published_idx` for `authorId`), as did `Series` and
    `Project`, so those three go without replacement.
14. **§8 step 5's "update `src/lib/__tests__/ordering.test.ts`" is a delete.**
    Every case in it was about minting or comparing fractional keys, so nothing
    in it had a subject left. `withIds` / `withoutIds` — the array maintenance
    both sides now share, lifted into `src/lib/orderArray.ts` so the server repo
    and the guest library cannot drift — are specced in its place
    (`orderArray.test.ts`). Net: 62 files / 1208 tests → 61 / 1203.
15. **`prisma/scripts/backfill-order.ts` is deleted, not kept.** It seeds the
    arrays *from* `rank` and cannot run once the column is gone. It had already
    served its purpose, and there is no second environment to run it against.
16. **The create path was not maintaining the store's arrays.** Phase 4 added
    `addToStoreOrder` for re-homes but left creates to the tolerant reader,
    which appends what it has not heard of — so a `placement: "start"` post
    read *last* until the next load. Invisible while the server still prepended
    it and a reload settled it; not invisible for a guest, whose store *is* the
    read. `createPost`, `duplicatePost`, `createSeries` and `createProject`
    now do the same bookkeeping their server halves do.
17. **§7's "the merged view orders by the cloud array when present, else the
    local array" describes a merge that does not exist.** There is one library
    at a time — `backendFor(user)` picks it from the session — so there is
    nothing to merge. What the sentence is really about is sign-in, and that is
    `importGuestDrafts`: it now uploads the drafts in the guest's own root
    order, because each cloud create appends, so the upload sequence *is* where
    they land.

**Verified.** A real browser against the live database
(`BUILD_DIR=.next-verify pnpm dev -p 3007`), signed in via a session cookie:
root reorder, within-series reorder, cross-series drag (two calls in order, the
id added to the destination at the dropped slot and removed from the source) and
a multi-select drag landing two rows as one contiguous block — each checked in
Postgres. The two paths this phase changed were exercised end to end: a create
with `placement: "end"` lands at the tail of `rootOrder` and one with `"start"`
at its head; deleting a series leaves `rootOrder` and frees its posts to the end
of root **in the series' own `postOrder`** — the case `freeIntoRoot` used to
mint a batch of ranks for; and deleting a post drops its id from the array.
Signed **out**, in a fresh profile: three drafts created at `/new` land in the
IndexedDB `orders` record in creation order with no `rank` field on any record,
"Move to top" and "Move down" rewrite that array and survive a reload, a draft
created with `?parentId=` lands in its parent's `tabOrder` and not in
`rootOrder`, "Split off as new post" moves it out of one and onto the end of the
other, a delete drops it — and the whole session makes zero `/api` writes. Every
row touched was restored and all eight tables are byte-identical to the
pre-change dump.
