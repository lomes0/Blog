# Series-as-node variant (sketch)

The unifying alternative to the two-plan approach
([`ordering-simplification.md`](./archive/ordering-simplification.md) +
[`schema-organization.md`](./schema-organization.md)): make **`Series` a kind of
`Document` node** so the whole content model is one tree, and ordering becomes
**one mechanism** — `childOrder` on the parent — everywhere.

This is a _sketch for comparison_, not an approved plan. §7 is the honest cost.

**Status: decidable, and now re-costed. Awaiting the author's call.** The
deferral of 27 Aug 2026 ran only until `rank` was gone; phase 5 of
[archive/ordering-simplification.md](./archive/ordering-simplification.md)
deleted it on 30 Aug, and phases B–D of
[schema-organization.md](./schema-organization.md) landed on 31 Aug. This sketch
asked to be re-read against the tree at that point rather than against the one it
was written on — **§9 is that re-reading**, and §1–§8 below are left as written
so the two can be compared. Read §9 first: three of §7's four cost bullets are
overstated or false, the §3 payoff is half-delivered already, and there is one
new question (`Project`) the sketch never had to ask.

---

## 1. The idea

Everything is a node in one self-referential table. A node's `parentId`
determines what it is _in_, and `kind` determines what it _is_:

```
root (author, parentId = null)
├── POST            (standalone)
├── POST            (tabbed post)
│   ├── POST        (tab child — parent is a POST)
│   └── POST
└── SERIES          (grouping node)
    ├── POST        (series member — parent is a SERIES)
    └── POST
```

The two separate parenting columns collapse into one:

| Today                                   | Series-as-node                         |
| --------------------------------------- | -------------------------------------- |
| `seriesId` → series membership          | `parentId` → parent is a `SERIES` node |
| `parentId` → tab membership             | `parentId` → parent is a `POST` node   |
| root = `seriesId null && parentId null` | root = `parentId null`                 |

One `parentId` replaces `seriesId` **and** `parentId`. Series membership and tab
membership stop being different things — both are just "who's my parent."

---

## 2. Schema sketch

```prisma
model Document {
  id          String   @id @default(uuid()) @db.Uuid
  kind        NodeKind @default(POST)                 // POST | SERIES  (replaces the dead DocumentType)
  handle      String?  @unique
  title       String                                  // was: name
  description String?
  createdAt   DateTime @default(now()) @db.Timestamptz
  updatedAt   DateTime @updatedAt      @db.Timestamptz
  authorId    String   @db.Uuid

  // POST-only fields (null on SERIES nodes)
  published       Boolean        @default(false)
  private         Boolean        @default(false)
  status          DocumentStatus @default(ACTIVE)
  backgroundImage String?        @map("background_image")
  tabLabel        String?
  headRevisionId  String?        @db.Uuid
  headRevision    Revision?      @relation("HeadRevision", fields: [headRevisionId], references: [id], onDelete: SetNull)

  // Fork relationship (POST-only)
  baseId String?    @db.Uuid
  base   Document?  @relation("BaseForks", fields: [baseId], references: [id], onDelete: SetNull)
  forks  Document[] @relation("BaseForks")

  // Unified hierarchy — parent is null (root) / a SERIES node / a POST node.
  parentId String?    @db.Uuid
  parent   Document?  @relation("Tree", fields: [parentId], references: [id], onDelete: SetNull)
  children Document[] @relation("Tree")

  // Order of THIS node's children (their ids). Empty for leaves.
  childOrder String[] @default([])

  author    User       @relation(fields: [authorId], references: [id], onDelete: Cascade)
  revisions Revision[] @relation("DocumentRevisions")

  @@index([authorId, kind])
  @@index([parentId])
  @@index([authorId, published])
}

enum NodeKind { POST SERIES }
```

```prisma
model User {
  // ...
  rootOrder String[] @default([])   // ids of the author's top-level nodes (POSTs + SERIES)
}
```

**Gone:** the `Series` model entirely, `seriesId`, the `SeriesPosts` relation,
`DocumentType`, and — from the ordering plan — `postOrder`/`tabOrder` (folded
into one `childOrder`) and `rank`.

---

## 3. Ordering: one mechanism instead of three

The ordering plan needed three arrays because there were three container types
in two tables. Here there's one container concept — "a node's children" — with
the root as the only special case (no node to hang the array on, so it lives on
`User`):

| Container    | Two-plan approach                                                          | Series-as-node      |
| ------------ | -------------------------------------------------------------------------- | ------------------- |
| Root list    | `User.rootOrder` (doc **+** series ids, **polymorphic** across two tables) | `User.rootOrder`    |
| Series posts | `Series.postOrder`                                                         | `parent.childOrder` |
| Tabs         | `Document.tabOrder`                                                        | `parent.childOrder` |

```ts
// The order array for a container. Root lives on User; every other node keeps
// its children's order on itself. One helper, parameterized by container.
type Container = { root: string /*userId*/ } | { parentId: string };

getOrder(c: Container): Promise<string[]>
setOrder(c: Container, orderedIds: string[]): Promise<void>   // the whole reorder API

// Read: identical for root, series, tabs.
orderBy(order, node.children)   // tolerant reader: unknown ids dropped, missing appended by createdAt
```

Crucially, the root array is **no longer polymorphic across tables**: every id
in `rootOrder` resolves to a `Document` row — you branch on `node.kind` for
rendering, not on "which table is this id in?" The two-table root merge that
started this whole thread **disappears structurally.**

---

## 4. Re-home: one function, no series-vs-tab special-casing

Moving a post — into a series, out to root, into a tab-group — is always the
same operation: set `parentId`, pull the id from the old parent's order, append
to the new parent's order.

```ts
async function moveNode(id, newParentId /* string | null */) {
  const { parentId: oldParentId } = await getNode(id);
  await setParent(id, newParentId);
  await removeFromOrder(containerOf(oldParentId), id);
  await appendToOrder(containerOf(newParentId), id); // position via a follow-up setOrder
}
```

Compare the two-plan version, which needs distinct move endpoints and
container-exclusivity logic (`seriesId` XOR `parentId`) because series and tabs
are different columns. Here they're the same column, so the exclusivity rule and
the separate `series/[id]/move` vs `documents/[id]/move` endpoints collapse into
one `moveNode`.

---

## 5. Migration sketch

1. Add `kind` (default `POST`), `childOrder`, `NodeKind`; add nullable
   `rootOrder` on `User`.
2. **Project each `Series` row into a `Document` row** with `kind = SERIES`,
   **preserving its id** (both are UUIDs) so posts' new `parentId` can point at
   it. Copy `title`, `description`, `authorId`, `createdAt`.
3. For every post with `seriesId = S`: set `parentId = S`, clear `seriesId`.
4. Backfill `childOrder` / `rootOrder` from the current `rank` order (the same
   backfill the ordering plan needs, just writing arrays keyed by parent).
5. Drop the `Series` table, `seriesId`, the `rank` columns/indexes, and
   `DocumentType`.

Reversible up to step 5 (Series table still present until then).

---

## 6. Head-to-head

|                             | Two plans (Document node + separate Series)                             | Series-as-node                                             |
| --------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| Ordering arrays             | 3 (`rootOrder`, `postOrder`, `tabOrder`)                                | 2 storage spots, **1 concept** (`childOrder` + root)       |
| Root list                   | polymorphic id array across **two tables**                              | homogeneous — all `Document` ids                           |
| Move endpoints              | `documents/[id]/move` + `series/[id]/move`, container-exclusivity logic | one `moveNode`                                             |
| Two-table root merge        | solved by convention (mixed-id array)                                   | **gone structurally**                                      |
| `Series` model / repo / API | kept (459-L repo, 5 routes)                                             | removed / folded into node queries                         |
| Redux state                 | `{ documents, posts, series }` stays                                    | `series` folds into the node collection (derived selector) |
| Migration churn             | low–moderate                                                            | **high** (see §7)                                          |

---

## 7. The honest cost

This is the expensive option. Concretely, "Series" appears in **56 source
files**, a **459-line `repositories/series.ts`**, **5 API routes** under
`/api/series/*`, a distinct `Series` TS interface, and its **own Redux state key
(`series: Series[]`)**. Series-as-node touches all of it:

- **Repositories/API:** every `series.*` query becomes a `document` query
  filtered by `kind = SERIES`; `/api/series/*` either forwards to node handlers
  or is rewritten. The 459-line series repo largely dissolves into the document
  repo.
- **Redux:** the store shape `{ documents, posts, series }` loses `series` as a
  first-class slice; series become nodes in the document collection, surfaced
  via a `selectSeries = nodes.filter(kind === SERIES)` selector. This ripples
  into every component reading `state.series`
  (`SeriesGrid`/`SeriesView`/`SeriesCard`, `PostsListView`, grouping utils).
- **Types:** `Series` becomes a _view_ over a node (`kind: SERIES`) rather than
  a standalone entity; `seriesId` references across `types.ts` and the API
  client change to `parentId`.
- **Local/IndexedDB:** the dual-storage series records fold into the node store
  the same way.

None of this is _hard_, but it's broad — it's a genuine refactor of the content
domain, not a schema tweak. The payoff is that the content model and the
ordering model each become a single uniform concept.

---

## 8. Recommendation

If the goal is the **cleanest possible ordering impl** and you're willing to
spend the churn once, Series-as-node is the right end state: ordering stops
being a special subsystem and becomes "order a node's children," and the
two-table root problem is designed out rather than worked around.

If you want to keep blast radius small right now, the two-plan approach gets you
90% of the ordering simplification (delete fractional indexing, one array per
container) for a fraction of the churn — at the cost of a permanently
polymorphic root array and a retained `Series` subsystem.

**Suggested path if you go this way:** do it as a _third phase_ after the two
plans land — ship ordering-as-arrays and the schema sweep first (small, safe),
then collapse `Series` into the node model as a focused domain refactor once the
`rank` machinery is already gone. That sequences the high-churn step last, on
top of an already-simplified base, instead of doing everything at once.

---

## 9. Re-costed against the tree (31 Aug 2026)

Written after the base this sketch waited on actually arrived. Measured, not
estimated; every number below is a command against the tree at `455e6bdf`.

### 9.1 What the base change did to the argument

`rank` is gone, and with it `lib/ordering.ts`, `lib/documentOrder.ts` and the
`fractional-indexing` dependency. `Document.type`, `DocumentType` and
`background_image` are gone too. So §5's migration sketch is partly **already
done**: its step 4 no longer backfills from `rank` (the arrays exist and are
authoritative), and its step 5 has only `Series`/`seriesId` left to drop.

The part of §3 this sketch sells hardest is also **half-delivered without it.**
`repositories/ordering.ts` already carries a container-parameterised core —
`OrderContainer`, `containerOf`, `readOrder`, `orderMemberIds`, `validateOrder`,
`setOrder`, `addToOrder`, `removeFromOrder` — about 240 of its 487 lines, shared
by every container kind today. Series-as-node does not buy that; it is bought.

What is still doubled is the **move** half, and only that:

| Doubled today                                | Lines |
| -------------------------------------------- | ----- |
| `seriesContainerOf` (beside `containerOf`)   | 11    |
| `moveSeries` (beside `movePost`)             | 25    |
| `freeSeriesIntoRoot` (beside `freeIntoRoot`) | 14    |
| `moveSeriesTx` (beside `moveDocumentTx`)     | 5     |

**~55 lines**, plus `POST /api/series/[id]/move` sitting beside
`POST /api/documents/[id]/move`. That is the honest size of §4's "one `moveNode`
instead of two" — a real simplification, and a much smaller one than §3's table
implies.

### 9.2 The new question the sketch never had to ask: `Project`

§3's table lists three containers. **There are four.** `Project` owns its member
series' order (`Project.seriesOrder`) *and* sits in the root list itself, so
`User.rootOrder` interleaves ids from **three** tables, not the two §6 calls
"the two-table root merge". The ordering plan hit this the same way — its §2 and
§4 both missed `Project`.

This matters because it is the one place series-as-node as sketched **does not
deliver its own headline**. Fold `Series` into `Document` and leave `Project`
alone, and the root array is still polymorphic — documents and projects instead
of documents, series and projects. "The two-table root merge disappears
structurally" becomes false; it merely gets smaller.

So the decision is really between three options, not two:

- **(a) Leave it.** Four containers, two move paths, ~55 doubled lines.
- **(b) Series-as-node as sketched.** Three containers, one move path for
  posts and series — and a root array that is still polymorphic, across
  `Document` and `Project`.
- **(c) Series *and* Project as nodes.** `kind = SERIES` and `kind = PROJECT`,
  one `childOrder`, root homogeneous, one `moveNode` for everything. This is the
  only version that actually delivers §6's claim. It costs a further
  `repositories/project.ts` (141 lines), 3 routes under `/api/projects/*`, and
  `projectId` across 22 files.

**(b) is the one option that pays most of the cost without buying the headline
benefit.** If this is worth doing it is worth doing as (c).

### 9.3 §7's numbers, re-measured

| §7 claims                            | Actually                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| "Series" in **56 source files**      | **76** — 57 of them mention `seriesId`. Wider than stated                       |
| **459-line** `repositories/series.ts` | **433**, of which 128 are imports/selects/mappers that get rewritten, not deleted |
| **5 API routes** under `/api/series/*` | **5**, correct — plus 3 under `/api/projects/*` the sketch never counted        |
| Own Redux state key                  | Correct, but see below                                                          |

### 9.4 Two of §7's four cost bullets are wrong, both in the cheap direction

**The Redux ripple is much smaller than §7 fears.** It names
`SeriesGrid`/`SeriesView`/`SeriesCard` as the components that would have to
change. **All three no longer exist** — the tree-model work
(`bloat-remediation.md` step 7, `archive/tree-model-brief.md`) deleted them, and
a series is now a row that contains its posts, built by `groupRootItems` +
`rootItemsToTreeNodes` from `src/lib/tree/`. Only **11 files** read
`state.series` / `state.projects` at all.

**The IndexedDB bullet is simply false.** There is no local series store to
fold: `src/store/backend/local.ts` says so in as many words — *"A guest has no
series and no projects, so those two container kinds cannot…"* — and
`grep -i series src/indexeddb/` returns nothing. Series-as-node has **no
local-storage half**.

### 9.5 What that leaves

Cheaper than §7 says on the client, wider than §7 says on the server, and buying
less than §3 says because ordering already generalised. The remaining case for
it is not "one ordering mechanism" — that is mostly built — but **one content
model**: `kind` instead of two tables, one homogeneous root array, one
`moveNode`, and `SeriesActions` / `DocumentActions` collapsing.

The recommendation in §8 stands with one amendment: **if you take it, take
option (c).** Option (b) is the trap — most of the churn, and the root array
stays polymorphic anyway.
