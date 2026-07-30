# Series-as-node variant (sketch)

The unifying alternative to the two-plan approach
([`ordering-simplification.md`](./ordering-simplification.md) +
[`schema-organization.md`](./schema-organization.md)): make **`Series` a kind of
`Document` node** so the whole content model is one tree, and ordering becomes
**one mechanism** — `childOrder` on the parent — everywhere.

This is a _sketch for comparison_, not an approved plan. §7 is the honest cost.

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

```
```
