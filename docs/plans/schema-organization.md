# Schema organization plan

**Goal:** make the Prisma schema idiomatic and clear, optimizing for
maintainability under a **single-user** blog. Companion to
[`ordering-simplification.md`](./archive/ordering-simplification.md) — that plan owns
the `rank` → order-array change; this plan owns everything else. Where they
touch the same models, this doc omits the ordering columns to avoid
double-specifying.

**Status: all four phases shipped.** Phase A on 30 Aug 2026
(`20260830113000_phase_a_schema_sweep`); B, C and D on 31 Aug 2026
(`20260831090000_head_revision_fk`, `20260831100000_document_title_rename`,
`20260831110000_drop_document_type`). §6 records what each phase found that this
document got wrong — chiefly that Phase A's column list was a third of the real
one, that §C's `background_image` rename was stale, and that Prisma generates a
destructive `DROP` + `ADD` for all three of the column changes these phases
make.

Two things this document does **not** describe, both settled by the author when
Phase D came round: `DocumentCoauthors`, `Document.coauthors`, `Document.collab`
and `User.coauthored` **stay** — §5's first open decision was declined, and they
are kept as a placeholder for collaborative editing. And `background_image` is
**dropped**, not renamed as §C proposes.

## Decisions locked

- **Content model:** keep the single self-referential `Document` table, but give
  it a clean identity — drop the vestigial `type` discriminator, treat
  `parent`/`children` as the real tab hierarchy, keep `base`/`forks` as a
  relation. _Not_ splitting posts/tabs into separate tables.
- **Mechanical cleanup:** all of — `timestamptz` everywhere · `head` → real FK ·
  `role`/status as enums · delete dead fields · drop redundant indexes.
- **Naming:** rename for consistency — `Document.name → title`,
  `background_image → backgroundImage`.
- The `Document` **model name stays `Document`** (renaming the model itself is
  huge client/import churn for little gain; the comment + dropped `type` give it
  identity). Field renames only.

## New finding: coauthors are already dead

`repositories/document.ts` returns `coauthors: []` with comments _"Remove
coauthor logic for simple blog structure"_ / _"Remove coauthor complexity"_, and
`api/revisions/route.ts` says _"Remove coauthor logic."_ So `DocumentCoauthors`
(and `Document.collab`, `User.coauthored`) is vestigial under single-user.

**Recommendation:** drop `DocumentCoauthors`, `Document.coauthors`,
`User.coauthored`, and `Document.collab` entirely. This is the single biggest
simplification available and it matches the single-user assumption. Flagged as
an open decision in §5 since it wasn't explicitly approved.

---

## Target schema (affected models, before → after)

### Document

```prisma
model Document {
  id          String   @id @default(uuid()) @db.Uuid
  handle      String?  @unique
  title       String                                   // was: name
  description String?
  createdAt   DateTime @default(now()) @db.Timestamptz  // was: bare DateTime
  updatedAt   DateTime @updatedAt      @db.Timestamptz  // was: bare DateTime
  authorId    String   @db.Uuid
  published   Boolean  @default(false)
  private     Boolean  @default(false)

  status          DocumentStatus @default(ACTIVE)
  backgroundImage String?        @map("background_image")  // renamed; @map avoids data migration
  tabLabel        String?

  // head revision as a real FK (was: loose `head String? @db.Uuid`)
  headRevisionId String?   @db.Uuid
  headRevision   Revision? @relation("HeadRevision", fields: [headRevisionId], references: [id], onDelete: SetNull)

  // series membership
  seriesId String? @db.Uuid
  series   Series? @relation("SeriesPosts", fields: [seriesId], references: [id], onDelete: SetNull)

  // fork relationship
  baseId String?    @db.Uuid
  base   Document?  @relation("BaseForks", fields: [baseId], references: [id], onDelete: SetNull)
  forks  Document[] @relation("BaseForks")

  // tab hierarchy — children are this post's tabs
  parentId String?    @db.Uuid
  parent   Document?  @relation("DocumentHierarchy", fields: [parentId], references: [id], onDelete: SetNull)
  children Document[] @relation("DocumentHierarchy")

  author    User       @relation(fields: [authorId], references: [id], onDelete: Cascade)
  revisions Revision[] @relation("DocumentRevisions")

  @@index([authorId, published])   // covers authorId-only lookups too
  @@index([published])             // was [published, type]; type dropped
  @@index([seriesId])
  @@index([parentId])
}
```

Removed: `type DocumentType` + the enum, `collab` (see §5 coauthors), `head`
loose UUID, the `DocumentType` "directories" comment. Ordering columns/indexes
(`rank`, `tabOrder`, the three `*, rank` indexes) are owned by the ordering
plan.

### Revision

```prisma
model Revision {
  id         String   @id @default(uuid()) @db.Uuid
  data       Json
  createdAt  DateTime @default(now()) @db.Timestamptz   // was: bare DateTime
  documentId String   @db.Uuid
  document   Document @relation("DocumentRevisions", fields: [documentId], references: [id], onDelete: Cascade)
  authorId   String   @db.Uuid
  author     User     @relation(fields: [authorId], references: [id], onDelete: Cascade)

  headOf     Document[] @relation("HeadRevision")   // back-relation for Document.headRevision

  @@index([documentId])
  @@index([authorId])
}
```

### User

```prisma
model User {
  id            String    @id @default(uuid()) @db.Uuid
  handle        String?   @unique
  name          String                              // person's name — unrelated to Document.title; keep
  email         String    @unique
  createdAt     DateTime  @default(now()) @db.Timestamptz   // was: bare DateTime
  updatedAt     DateTime  @updatedAt      @db.Timestamptz
  disabled      Boolean   @default(false)
  emailVerified DateTime? @db.Timestamptz
  lastLogin     DateTime? @db.Timestamptz
  image         String?
  role          UserRole  @default(USER)            // was: String @default("user")
  // rootOrder String[] — owned by the ordering plan
  accounts      Account[]
  sessions      Session[]
  revisions     Revision[]
  documents     Document[]
  series        Series[]
  notesCanvases NotesCanvas[]

  @@index([email])
  @@index([handle])
}

enum UserRole { USER ADMIN }
```

Removed: `coauthored` (see §5).

### Series

```prisma
model Series {
  id          String   @id @default(uuid()) @db.Uuid
  title       String
  description String?
  createdAt   DateTime @default(now()) @db.Timestamptz
  updatedAt   DateTime @updatedAt      @db.Timestamptz
  authorId    String   @db.Uuid

  author User       @relation(fields: [authorId], references: [id], onDelete: Cascade)
  posts  Document[] @relation("SeriesPosts")

  @@index([authorId, createdAt])   // covers authorId-only lookups
  @@index([title])
}
```

Removed: standalone `@@index([authorId])` (redundant with the composite),
`rank` + its index (ordering plan).

### Account

```prisma
// Drop OAuth1 leftovers — never referenced in src, unused with Google OAuth2:
//   oauth_token_secret, oauth_token
```

Keep the rest as-is (NextAuth adapter dictates its snake_case field names — do
**not** rename those).

### DocumentCoauthors

See §5 — recommended for deletion.

---

## Migration phases (each independently shippable)

**Phase A — safe sweep (no app-logic change).**

- `timestamptz`: alter every bare `DateTime` column to `timestamptz`
  (`Document`, `Revision`, `User`, and `User.emailVerified/lastLogin`).
  `ALTER COLUMN ... TYPE timestamptz USING ...` — assumes stored values are UTC
  (they are; app writes UTC). Verify before running.
- Drop `Account.oauth_token`, `oauth_token_secret`.
- Drop redundant indexes: `Series @@index([authorId])`,
  `Document @@index([authorId])`.
- `User.role String → UserRole` enum: create enum, backfill `'user'→USER`,
  `'admin'→ADMIN` (case-insensitive), then alter column.

**Phase B — `head` → real FK (the one non-trivial step).** `head` is currently a
client-generated UUID (`head: uuidv4()`) set _before_ the revision exists, with
no referential integrity. To make it a real FK:

1. Add nullable `headRevisionId`; backfill `= head` **only where a `Revision`
   with that id exists**, else null.
2. Ensure the create flow persists the initial `Revision` _before/with_ setting
   `headRevisionId` (audit `NewDocument.tsx`, `CreatePostDrawer.tsx`,
   `localImporter.ts` — they mint `head` up front).
3. Add the FK constraint (`onDelete: SetNull`), drop the old `head` column.
   Risk: any code reading `.head` as a bare string (`types.ts:67`,
   `repositories/series.ts`, export manifest) must switch to `headRevisionId`.

**Phase C — renames (scoped, typed pass).**

- `background_image → backgroundImage` with `@map("background_image")` → no data
  migration, ~27 code sites.
- `Document.name → title`: `.name` appears in ~92 files but is heavily
  overloaded (User.name, series, DOM, etc.). **Do not blind-replace.** Rename
  the Prisma field, let TypeScript surface the exact `Document`/post call sites,
  fix those only. Keep `User.name` (person's name — legitimately different from
  a post title).

**Phase D — node identity + coauthor removal.**

- Drop `DocumentType` enum + `Document.type` + the `[published, type]` index
  (replaced by `[published]`); delete the "directories" comment.
- If approved: drop `DocumentCoauthors`, `Document.coauthors`,
  `Document.collab`, `User.coauthored` and their reads (already return `[]`).

Order note: Phase A is pure DB/no-logic and lands first. B, C, D each carry code
changes and can land independently. Coordinate the `rank` removal from the
ordering plan alongside D (both touch `Document` indexes).

---

## 5. Open decisions

1. **Drop `DocumentCoauthors` + collab entirely?** Strongly recommended — the
   logic is already stubbed to `[]` and it's meaningless single-user. Confirm
   there's no near-term plan to revive collaborative editing. (If revived later,
   re-key the join on `User.id`, not `userEmail`.)
2. **`timestamptz` backfill assumption.** Confirm all existing bare-`DateTime`
   values were written as UTC before the `USING` cast. If any local-time values
   exist, the cast needs an explicit source zone.
3. **`head` create-order.** Confirm every create path can persist the initial
   revision before setting `headRevisionId`, or make `headRevisionId` remain
   nullable and set it on first save.

---

## Net effect

Clearer single-node identity · timezone-safe timestamps · referential integrity
on the head-revision pointer · enums instead of magic strings · no dead OAuth1 /
`type` / coauthor cruft · fewer indexes · consistent field naming. All without
adding a single table.

---

## 6. Phase A, as built (30 Aug 2026)

Migration `20260830113000_phase_a_schema_sweep`, hand-written rather than
generated. Four corrections to the text above, and the last two matter beyond
this phase.

**The `USING` clause is explicit.** The casts read
`USING "col" AT TIME ZONE 'UTC'`, not the bare `SET DATA TYPE TIMESTAMPTZ`
Prisma generates. Both agree on a server whose `TimeZone` is UTC, which this
one's is — but the implicit form reads the zone off the *applying session*, so a
future migration applied over a connection that sets `timezone` would rewrite
every timestamp, wrongly and without complaint. The explicit form states a fact
about the writer instead of about whoever runs the migration.

**The UTC assumption (§5.2) was verified, not assumed.** `mcp/smokeHttp.ts`
names each throwaway token `smoke-http ${new Date().toISOString()}` — an
unambiguous UTC instant inside the row's own `name` — and the bare `createdAt`
written in the same statement agrees with it to the millisecond, on a machine
whose local zone is +03:00. A local-time write would have been off by three
hours.

**21 columns, not the 7 Phase A enumerates.** The list above predates
`AgentToken` and `ProviderCredential` entirely, and missed
`Document.agentCreatedAt`, `Revision.proposedAt`/`staleAt` and
`DocumentCoauthors.createdAt` on models it does name. It also never mentions the
two NextAuth adapter tables: `Session.expires` and `VerificationToken.expires`
are converted too, because the adapter dictates those columns' *names* and not
their type, and an expiry compared against `now()` is exactly the value a
zoneless timestamp gets wrong. `Blob`/`BlobRef` were already `@db.Timestamptz`.

**`Document @@index([authorId])` does not exist** — not in the schema, not in
the database. Only `Series @@index([authorId])` was there to drop.
`Document_authorId_published_idx` and `Document_authorId_rank_idx` already lead
with `authorId`.

**"No app-logic change" was false.** Converting `User.role` broke two admin
checks — `api/revalidate/route.ts` and `api/users/[id]/route.ts` compared it to
the string `"admin"`, which stops matching once the stored value is `ADMIN`.
`tsc` caught both as TS2367; had the column been left untyped they would have
sent every admin a 403. Two things guard the conversion itself: it alters the
column **in place**, because Prisma's own generated SQL for this change is
`DROP COLUMN` + `ADD COLUMN` and would have discarded every stored role; and the
`CASE` is deliberately total, so a value that is neither `user` nor `admin`
yields NULL and trips the NOT NULL rather than quietly becoming `USER`.

**Noticed, not touched.** `Document` carries two identical unique indexes on
`handle` — `Document_handle_key` and a legacy `documents_handle_key`. Prisma
reports no drift over it, so a migration created it. Dead weight for a later
phase, and out of Phase A's scope.

---

## 7. Phases B–D, as built (31 Aug 2026)

Three migrations, all hand-written:
`20260831090000_head_revision_fk`, `20260831100000_document_title_rename`,
`20260831110000_drop_document_type`. Nine corrections and findings, of which the
first four are the ones worth carrying forward.

**Prisma's generated SQL was destructive for all three column changes, and
Phase A's `role` was not a one-off.** `migrate diff` produces `DROP COLUMN
"head"` + `ADD COLUMN "headRevisionId"` (discards 206 pointers), `DROP COLUMN
"name"` + `ADD COLUMN "title" TEXT NOT NULL` (discards 206 titles — and would
not even run, since the table has rows and the column has no default), and only
for §D — where there is genuinely nothing to keep — is it right. Four schema
changes across the four phases, three of which the tool would have destroyed.
Read the generated SQL every time; the rule is not "watch out for enums".

**§C's `background_image → backgroundImage` was stale, and the column is
dropped.** The feature was removed and its bytes deleted (blob-storage.md
§10.2), no code writes or renders it, and it was 0 non-null across all 206
documents. Renaming it would have given a dead column a tidier name to be dead
under. The export bundle still *reads* the field, so an old `.zip` still
imports; it just no longer has anywhere to put it.

**§5's third open decision has a better answer than "keep it nullable".** The
column is nullable — but not as a hedge. `onDelete: SetNull` is what it is
*for*, and Prisma requires an optional field to express it, so nullable was
never a choice. The create order is: document row, then the revision, then the
pointer, all in one transaction. `createDocument` takes `headRevisionId` as a
separate argument for exactly this reason and its type `Omit`s it from the
create input, so passing it through `data` — which could only ever be a foreign
key violation — does not compile. `proposeNewPost` grew a third statement in its
existing `$transaction`, and `/api/import` was restructured. A post therefore
still never commits without a head, and `null` now means "the head revision was
deleted", which is the state `findDocument`'s repair already handles.

**`updateDocument`'s write order became load-bearing.** A content save arrives
as a nested `revisions.connectOrCreate` and a scalar `headRevisionId` naming the
row it creates. The compare-and-set arm used to write the scalars *first* and
replay the relations afterwards, which with a foreign key is a violation every
time; leaving both in one `update` would have put the ordering in Prisma's
hands. Both arms now split the relation writes off and run them first,
unconditionally. Safe to do before the guard because a save that loses the
compare-and-set rolls the revision back with it.

**`/api/import` could never have imported a new document.** It created each
document's revisions before the document row they point at, so
`Revision_documentId_fkey` refused the first one and the whole import failed —
on any document this deployment had not already seen. Nothing caught it because
nothing exercised it: there is no spec, and the round-trip had not been run.
Phase B had to reorder these writes anyway; the fix came with it.

**Four silent breaks `tsc` could not see, and one class of place to look.**
Renaming a Prisma field is compiler-checked almost everywhere, which is the
method §C prescribes and it works — but four sites escaped it:
`documentCoreSelect` and `proposalSummarySelect` are `as const` objects whose
keys Prisma only validates at query time; `toCloudDocument` takes
`Record<string, unknown>` and returns `as unknown as CloudPost`; and two
`$queryRaw` templates name `d.name` and `d."type"` as text. All four would have
been 500s on the main read path. `grep -rn "name: true\|head: true"` and
`grep -rn '\$queryRaw'` are what found them.

**The wire field names had to move with the model.** `documentFields` in
`api/documents/schemas.ts` is the request body for create and update, and both
ends of that seam are this app: the client sends a `Post`, so leaving the schema
on `name`/`head` would have made every create silently mint the wrong revision
id and every save 400 on the `.strict()` update schema. They are `title` and
`headRevisionId` now. `expectedHead` keeps its own name — it is a precondition,
not a column. The command registry's `document.rename` parameter moved from
`name` to `title` as well, which is a change to the in-app agent tool surface,
and makes it agree with `rename_post` on the MCP side, which already said
`title`.

**The export bundle keeps its own vocabulary.** `documents/{id}.json` still
carries `name`, `head` and `type`; the model's names are read as alternatives by
`readDocumentExport`, which both importers now go through. A bundle is a format
with copies in users' hands, not a projection of the schema, so the mapping
lives in one function rather than in the columns. `background_image` is the one
field export no longer *writes*, because there is nothing left to write.
`CURRENT_SCHEMA_VERSION` is unchanged: nothing incompatible happened.

**The IndexedDB half is a real migration now, and the first version of it lost
two changes out of three.** A guest's drafts are the only copy that exists, and
up to v8 every bump only *added* a store, so `onupgradeneeded` had never
rewritten a record. v9, v10 and v11 rename fields those records already carry.
The first implementation ran one cursor pass per version over the `documents`
store — and three cursors open on one store each hold the record as they found
it, so they took turns writing back the original plus their own change and the
last one won. A v8 profile came out of the upgrade with `type` dropped and
`name`/`head` untouched, while the index swaps beside them had succeeded, so it
looked like it had worked. Migrations now *declare* their record transform
(`IndexedDBMigration.records`) and the opener composes every crossed version
into one pass per store. `recordTransformsFor` is that composition, exported so
`src/indexeddb/__tests__/migrations.test.ts` exercises the same function the
browser does — a spec that composed them by hand agreed with itself while the
real thing was broken. Verified against a profile whose drafts were written by
the previous build: both survive v8 → v11 with their titles, their content
byte-identical, and the root order intact.
