# Schema organization plan

**Goal:** make the Prisma schema idiomatic and clear, optimizing for
maintainability under a **single-user** blog. Companion to
[`ordering-simplification.md`](./ordering-simplification.md) — that plan owns
the `rank` → order-array change; this plan owns everything else. Where they
touch the same models, this doc omits the ordering columns to avoid
double-specifying.

Status: proposal. Nothing implemented.

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
