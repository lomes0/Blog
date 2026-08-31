# Blob storage: one content-addressed store for every byte

Status: **complete for every picture in the database; the collector is written
but not yet *scheduled*, and cannot be until there is a deployment to schedule it
on (§11.2 — answered 31 Aug 2026, pending a box).** The two SVG node types
(sketch, graph) were the one thing 2 and 3 both stopped short of; **§10.1 held
that decision, §13 takes it — migrate both — §13.6 is the run and §13.7 the
browser pass that accepted it. There are no data URIs left in any revision.** **§10.2 closes §10's
step 5, and does it by subtraction: backgrounds were a removed feature's
leftovers and are deleted rather than migrated, attachments stay on disk on a
blocker that is not effort, and §10's expected outcome is wrong about both.** §11.1 records why
phase 4 answered §8 instead of building it. Decided
2026-08-13 after measuring the live database (§1); §11 is the phase log and is
the thing to read before acting on any section body. Two sections are
corrections written while building rather than parts of the original design —
§3.1, §3.2 and §7.1 — and §3.1 contradicts the paragraph above it on purpose.
Supersedes
[archive/storage-uploads.md](./archive/storage-uploads.md), which moved two asset
classes to object storage and deliberately left the third — the one holding most
of the bytes — in Postgres.

Explicitly authorized: **no backward-compatibility constraints.** That is what
makes this plan possible at all; the document format changes, and the old shape
is not kept working alongside the new one.

## 1. Why — the measurement that decided it

Run against the live dev database, not estimated:

| Embedded as | Copies stored | **Distinct** | Size now | Deduplicated |
| --- | --- | --- | --- | --- |
| `data:image/png;base64,` | 67 | **1** | 10 MB | 157 kB |
| `data:image/svg+xml,` (sketches, graphs) | 74 | **5** | 3.6 MB | 396 kB |
| **Total** | **141** | **6** | **13.6 MB** | **553 kB** |

**Six distinct images are stored 141 times.** One PNG accounts for 10 MB on its
own — roughly a third of the whole 32 MB database. `Revision` is 23 MB of that
32 MB, and 13 MB of the revision JSON is these six pictures.

The mechanism is not exotic. Inserting an image puts a data URI straight into
the node's `src`; that string is serialized into the Lexical state and stored as
`Revision.data`. So **every save of a document containing an image writes
another full copy of that image.** Uploads grow when you upload. This grows when
you type.

A ~25× reduction is available, and the shape of the waste — the same bytes,
stored repeatedly, under different keys — is precisely what content addressing
exists to fix. That is the argument for this design over any other.

## 2. The model

**One store. Every binary in the app goes through it. The key is the hash of
the content.**

Today bytes live in three places under three different rules:

| Class | Today | Access rule |
| --- | --- | --- |
| Attachments | filesystem, `var/uploads/attachments` | authorized per document |
| Backgrounds | filesystem, `public/uploads/directories` | public, static |
| Editor images / sketches / graphs | **base64 inside `Revision.data`** | whatever the document's is |

Three answers to "where do bytes live" is the actual defect; the duplication is
a symptom. After this plan there is one answer, and `src/lib/uploads.ts`'s
two-root split becomes a property of *serving*, not of storage.

Content addressing buys four things, and each maps to a real problem here:

- **Dedup is automatic and permanent.** The 141→6 collapse falls out of the
  design rather than from a cleanup job, and a re-save costs nothing forever
  after.
- **Blobs are immutable**, so `Cache-Control: public, max-age=31536000,
  immutable` is unconditionally correct — no invalidation problem exists.
- **Fork, duplicate, revision and copy-paste share bytes for free.** Most of the
  observed duplication is exactly this.
- **Integrity is checkable** — the key is the checksum.

## 3. Schema

```prisma
model Blob {
  hash      String   @id            // sha256 of the bytes, lowercase hex
  size      Int
  mimeType  String
  createdAt DateTime @default(now())
  refs      BlobRef[]
}

model BlobRef {
  blobHash   String
  documentId String
  blob       Blob     @relation(fields: [blobHash], references: [hash], onDelete: Cascade)
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now())

  @@id([blobHash, documentId])
  @@index([documentId])
}
```

`BlobRef` is not bookkeeping — it is what makes §4 and §5 answerable at all. A
blob store without a reference table can neither authorize nor collect.

Note `BlobRef` is per **document**, not per revision. Revisions come and go
constantly; a reference that churned with them would be write-amplification of
the kind this plan exists to remove. The reference set is recomputed when a
document's content changes, as a diff against the previous set.

### 3.1 What a document references — corrected while building reconciliation

Two things above are wrong as written, and both were found by asking what the
recompute costs.

**"A diff against the previous set" is not enough, because the set is the union
over *all* the document's revisions and not just the one at `head`.** Revisions
stay readable and restorable (`GET /api/revisions/[id]`), so an image deleted
from the current draft is still needed by the history behind it. Diffing head
against the recorded refs would drop that reference, §5 would then collect the
bytes, and restoring the revision would hand back a post with a dead image —
user work destroyed by a bookkeeping job, which is the one outcome this
mechanism must not produce.

**Recomputing that union from `data` is unaffordable.** Measured against this
blog's database: 1475 revisions over 206 documents, and the worst single
document is **120 revisions totalling 11 MB**. Reading them on the write path
would be fine once and pathological forever after — the scan is needed exactly
when head and history disagree, which is the permanent state of any post an
image was ever deleted from. That is a slow save on precisely the documents this
plan exists for.

So the union is answered from a derived column instead:

```prisma
model Revision {
  blobHashes String[] @default([])   // what this revision's content references
}
```

Written **in the same statement as the `data` it describes** — `blobHashesFor`
in `src/lib/blobRefs.ts` is the only thing that computes it — so a row cannot
hold content and a stale list of its blobs. Reconciliation is then three small
queries with no JSON in any of them, identical whether content arrived, changed
or was deleted. The column is a cache of `data`, never a second source of truth,
and it is backfilled in the migration that adds it so that no revision predating
it reads as referencing nothing.

Per-revision *refs* are still rejected, for the reason above and one more: a
reference is created at **upload** time, before any revision mentions the image
(§6), and per-revision rows cannot express a reference that no revision holds
yet.

### 3.2 The grace period is on the reference, not just the blob

`BlobRef.createdAt` is what makes the upload-before-save window safe. Between
pasting an image and saving the document, the reference is real and no revision
mentions it — so a reconcile triggered in that window by anything else touching
the document (an agent proposing, a revision deleted in another tab) would
revoke it, leaving the blob with zero references and collectable while an open
editor still holds its URL. The save then arrives pointing at an object that no
longer exists, and nothing can repair it.

**A reference younger than `BLOB_REF_GRACE_MS` (24 hours) is never removed**,
whatever the content says. The window is far longer than the gap it covers, and
over-holding costs only that a deleted image's bytes are reclaimed a day late.
This answers §13's grace-period question for the reference; the collector's own
window is still open.

## 4. Authorization under deduplication

**This is the design's sharpest edge, and getting it wrong is a data leak.**

Dedup means one blob can be referenced by a public post *and* a private one.
There is therefore no such thing as "this blob's ACL" — the question is
incoherent as posed.

**Authorize on the reference, not the blob.** `GET /api/blob/[hash]` asks: *does
this caller have read access to any document referencing this hash?* One indexed
query over `BlobRef` joined to the same access rules `src/lib/access.ts` already
implements. It belongs in that file, as `requireBlobRead(hash, user)`, so that
forgetting it is a missing variable rather than a missing line — the standing
convention in CLAUDE.md.

**Rejected: treat the hash as a capability.** A 256-bit key is unguessable, so
"possession of the hash is permission" is superficially attractive and is how
many content-addressed stores work. Rejected because hashes *leak by design
here* — they will appear in revision JSON, in export bundles, in the MCP tools'
block output, and in any document a reader can already see. Capability semantics
would convert every one of those into an access grant. The app has a real
authorization layer; do not downgrade to bearer-by-obscurity.

One consequence to accept knowingly: a blob referenced by both a public and a
private document is readable by anyone, because it is readable *through the
public document*. That is correct — the bytes are already public — but it means
"private" is a property of documents, never of blobs.

## 5. Garbage collection

Content addressing without collection is a leak with extra steps.

- **Never delete on the write path.** A blob can be re-referenced between the
  check and the delete — by a concurrent paste of the same image, which is
  exactly the common case under dedup.
- **Mark and sweep, offline, with a grace period.** A blob with zero `BlobRef`
  rows and `createdAt` older than the grace window is collectable. The window
  covers the gap between uploading a blob and saving the document that
  references it.
- Deletion order is object store first, then row — the reverse orphans bytes
  invisibly, and an orphaned object is cheaper than an orphaned row pointing at
  nothing.

Run it as a scheduled job, and have it **log what it collected**. A GC that
silently removes user data is the one job that must be loud.

## 6. What replaces the data URI

In the node: `src: "/api/blob/<hash>"`.

- **Not an absolute URL** — that bakes a hostname into every stored document and
  needs a data migration whenever it changes. `archive/storage-uploads.md`
  reached the same conclusion for backgrounds.
- **Not a bare hash** — the string is rendered directly by `exportDOM`, `/view`
  and the OG route; keeping it a resolvable path means those need no resolver.

The three producers of data URIs are the whole of phase 2's client work:

| File | What it does today |
| --- | --- |
| `ToolbarPlugin/Dialogs/ImageDialog.tsx:111` | `mediaFileReader` → data URI |
| `DragDropPastePlugin/index.ts:34` | `mediaFileReader` → data URI (paste, drag-drop) |
| `ToolbarPlugin/Dialogs/Sketch/index.tsx:365` | `readAsDataURL` → SVG data URI |

Each becomes: hash the bytes client-side, ask the backend whether it already has
that hash, upload only if not, then set `src` to the blob path. **The dedup
check happens before the upload**, so re-pasting a known image costs one round
trip and no bytes.

### 6.1 Sketches are not a `src` swap — found during phase 2

The first two producers took the change as written. **The third does not, and
the reason is a finding rather than an obstacle.**

`SketchNode.__src` is not merely a picture. It is a `data:image/svg+xml,…` with
the sketch's own source data embedded inside the SVG between
`<!-- payload-start -->` and `<!-- payload-end -->` markers, which `decorate()`
decodes and strips on every render
(`packages/editor/src/nodes/SketchNode/index.tsx:193-197`). So the string is
simultaneously the rendering *and* the document.

Worse, `exportJSON` also persists `value` — the `ExcalidrawElement[]` — so **a
stored sketch appears to carry its source twice**: once as JSON in `value`, once
embedded in the SVG in `src`. `getValue()` reads only `value`, which suggests
the embedded payload is vestigial for this app and kept for Excalidraw's own
importer. That is a suggestion, not a conclusion — it was not chased down.

Consequences for this plan:

- Pointing `src` at a blob is safe for *rendering* but moves the embedded
  payload out of the document, where `decorate()` currently reads it
  synchronously. A blob URL cannot be decoded synchronously.
- The 74 SVG occurrences measured in §1 are the ones that would move, so the
  win is real — 3.6 MB to 396 kB — but it is not available for the price of a
  one-line change.
- **Do not ship this as a `src` swap.** Sketches hold user work, and 74 stored
  occurrences would be rewritten by a migration built on a guess about what the
  embedded payload is for. Establish that first.

## 7. Where the bytes live

**Cloudflare R2**, chosen over B2 for one reason that is specific to this
deployment: Cloudflare is already in front of the origin
(`production-deployment.md` §1.1), so public blobs are served from the same CDN
with **zero egress cost**, and the box leaves the path entirely. B2 is the
fallback and is a one-line change.

`src/lib/storage.ts`, hash-keyed and vendor-neutral:

```ts
putBlob(hash, bytes, mimeType): Promise<void>   // idempotent by construction
getBlob(hash): Promise<Buffer>
blobExists(hash): Promise<boolean>
presignBlobGet(hash, expiresIn): Promise<string>
hashBytes(bytes): string
isValidHash(hash): boolean
```

On `@aws-sdk/client-s3` against `S3_ENDPOINT`, per `archive/storage-uploads.md`'s
reasoning — which has now survived three hosting reversals and been used twice.

### 7.1 One bucket, not two — corrected during phase 1

**This section originally said "two buckets stay", carrying the public/private
split forward from `archive/storage-uploads.md`. That was wrong, and building
phase 1 is what showed it.**

The split does not survive content addressing, for exactly the reason §4 gives
for ACLs. A blob deduplicated across a published post and a private draft would
belong in *both* buckets, and would have to be moved whenever either document's
visibility changed. Bucket placement is a property of the blob; visibility is a
property of the document; deduplication severs the two. The inherited rule
("public access is granted per bucket, not per prefix") is still true — it just
stopped being answerable, because there is no longer a per-blob answer to give.

So: **one bucket, private**, and `/api/blob/[hash]` decides per request from the
documents referencing the blob. Public content still gets CDN-cached, because
the response carries `Cache-Control: public, max-age=31536000, immutable` — safe
unconditionally, since a hash's bytes never change. What that directive must
follow is `isPublic` (could an *anonymous* caller have fetched this?) and never
"did this caller succeed?" — an author fetching their own private draft
satisfies the second and not the first, and a shared cache told `public` there
would serve that draft's image to everyone, irreversibly.

`publicBlobUrl` is dropped with the second bucket: there is no direct-from-store
public URL when nothing in the store is public.

Local development is **MinIO in `docker-compose.yml`**, so the code path under
test is the one that runs in production. MinIO is the local half of this
decision and is not a production backend — see the standing constraint in
`archive/storage-uploads.md` §Constraints.

`putBlob` is idempotent for free: the key is the content, so re-uploading is a
no-op rather than a conflict.

## 8. Offline and local parity

The `PostBackend` seam (`src/store/backend/index.ts`) is what makes this
tractable, and it is where the work goes. Add a `blobs` sub-interface beside the
existing `revisions`:

```ts
blobs: {
  has(hash: string): Promise<boolean>;
  put(hash: string, bytes: Blob, mimeType: string): Promise<void>;
  url(hash: string): Promise<string>;   // https for cloud, object URL for local
}
```

- **`cloudBackend`** → `/api/blob/*`, R2 behind it.
- **`localBackend`** → IndexedDB. It already stores documents there
  (`src/indexeddb/`); a blob store beside them is the same machinery, and
  `url()` returns an object URL from the stored `Blob`.

**This is the honest cost of the plan.** Today a guest draft with an image works
offline *because* the data URI is self-contained; documents stop being
self-contained here, so local storage has to carry the bytes explicitly. In
exchange, guest drafts get the same dedup, and `importGuestDrafts` gains a
well-defined job — upload the local blobs, then rewrite nothing, because the
`src` is already the content-addressed path. **The hash is the same on both
sides of the seam.** That is worth stating plainly: it is the property that
makes local→cloud import a byte upload rather than a document rewrite.

## 9. Render and export paths

Everything that renders a document outside the editor needs blobs to resolve:

| Path | Change |
| --- | --- |
| `/view/[id]`, `exportDOM` | None — `src` is a working URL |
| `/api/og` | Runs on the **edge runtime**; confirm it can reach the blob URL |
| `/api/export` | **Must inline blobs into the zip.** It already builds one |
| `/api/import` | Extract blobs from the zip, `putBlob`, rewrite refs |
| `/api/docx/[id]` | Fetches image bytes rather than decoding a data URI |

Export is the one that must not be got wrong: a bundle that references blobs by
URL is not a backup, it is a bookmark. **The zip has to carry the bytes.**

## 10. Migration

One script, `scripts/migrate-blobs.ts`, and it is two-sided — extract *and*
rewrite — so it must be transactional per document.

1. Walk every `Revision.data`, find every `data:` URI (both forms — `;base64,`
   and the URL-encoded `image/svg+xml,`; §1's counts came from matching both,
   and a script matching only base64 would miss all 74 sketches and graphs).
2. Decode, hash, `putBlob`. Six objects, from 141 occurrences.
3. Rewrite each `src` to `/api/blob/<hash>`; write back the revision JSON.
4. Insert `Blob` and `BlobRef` rows.
5. Migrate `attachments/` and `public/uploads/directories` the same way — hash,
   upload, rewrite the referring column.
6. **Verify before deleting anything**: every referenced hash exists in the
   bucket, and no `data:` URI survives in any revision.

Expected outcome: **the database drops from ~32 MB to ~19 MB**, and ~20 MB of
deduplicated objects land in R2 (dominated by the 19 MB of backgrounds, which do
not dedup — they are 70 distinct images).

Run it against a restored dump first. This rewrites every revision in the
database, and §5's grace period does not protect against a bad rewrite.

### 10.1 Which node types may be migrated — settled 15 Aug 2026

Step 1 above says "find every `data:` URI". That is the right thing to *find*
and the wrong thing to *rewrite*, and §6.1 already knew it for sketches. Running
the question past all three types gives an answer that splits them differently
than §1's table does — §1 groups by encoding (base64 vs percent-encoded), and
the thing that actually decides is **how the node renders a `src` that is not a
data URI**:

| Type | data URI renders as | URL renders as | Migrated |
| --- | --- | --- | --- |
| `image` | `<img>` | `<img>` | **yes** — nothing about rendering changes |
| `graph` | inline `<svg>` | `<img>`, guarded on the prefix in both `decorate` and `exportDOM` | not yet |
| `sketch` | inline `<svg>` | nothing — it decodes `__src` unconditionally | no |

So `image` was migrated and the two SVG types were not, which also happens to be
where the bytes are: **one PNG stored 67 times was 7.7 MB of the 10.8 MB**.

§6.1 asked for one thing to be established before touching sketches — what the
payload embedded between `<!-- payload-start -->` and `<!-- payload-end -->` is
for. It is established, and the answer is *nothing this app reads*: the sketch
editor loads a drawing from `node.getValue()`, which returns `__value`
(persisted separately by `exportJSON`), and every one of the four sites that
touches the embedded copy — `SketchNode.decorate`, `SketchNode.exportDOM`,
`ImageComponent`'s svg branch, `docx/image.ts` — **strips** it. Nothing parses
it. It is Excalidraw's own re-import format, kept for external tools.

That removes the reason for the caution but not the blocker, and the blocker
turns out to be smaller and different than §6.1 thought. Migration does not
destroy the payload — the bytes move into the blob intact, so nothing is lost
either way. What it changes is that an inline `<svg>` becomes an `<img>`. For
graphs that already works; for sketches it needs the same prefix guard GraphNode
carries. **Both are then a rendering change to verify in a browser, not a
migration** — which is why they are held back as one decision rather than two,
worth 3.1 MB across 77 occurrences.

### 10.2 Step 5 is answered rather than deferred — 27 Aug 2026

Step 5 above — "migrate `attachments/` and `public/uploads/directories` the same
way" — was the one part of §10 never done, and §11 twice recorded it as a
separate slice waiting its turn. Asking the question directly split it into two
unrelated answers, and neither is "migrate it".

**Expected outcome, corrected.** §10 predicts "~20 MB of deduplicated objects
land in R2 (dominated by the 19 MB of backgrounds, which do not dedup — they are
70 distinct images)". That figure is wrong, and not by a little: the backgrounds
are not live data. What actually remains for the store is ~180 KB of
attachments. `production-deployment.md` §2 inherits the same error where it calls
backgrounds "nearly all of the data".

#### Backgrounds: deleted, not migrated

The feature had already been removed, and only its bytes were left. Five things
agreed, and no reading of them leaves the data live:

- `POST /api/documents/[id]/background` threw unconditionally — `"Background
  images are only supported for directories, which have been removed"` — before
  reading the form. Every line of upload code below that throw was unreachable.
- Nothing in the client fetched that route.
- `updateBackgroundImage` in `useEditDocumentForm.ts` was exported from the hook
  and had **zero consumers**.
- **Nothing rendered `background_image`.** The only `backgroundImage` uses in the
  tree are a sidebar drag gradient and the canvas grid.
- The files were `dir_<uuid>_*.png` dated Aug 2025 — orphans of the deleted
  directories feature, addressed by a URL shape (`/uploads/directories/…`) named
  after a model the app no longer has.

So migrating them meant paying R2 rent in perpetuity to preserve bytes nothing
reads, at zero dedup benefit — content addressing has nothing to collapse across
70 distinct images. Removed instead: the throwing route, `BACKGROUNDS_DIR`, the
export bundling and import restore of `assets/backgrounds/`, the unused setter
and its form plumbing, the `blog-backgrounds` volume in
`docker-compose.prod.yml`, and the second `mkdir`/`chown` in the Dockerfile.

**`Document.background_image` stays**, in the schema and in the export manifest.
Dropping it needs an irreversible migration for a nullable string, and keeping
the manifest field means bundles written before this still import without a
schema-version bump. It is inert: nothing writes it and nothing renders it.

**The API surface is closed too**, which is a second decision rather than part of
the first. `background_image` left `documentFields` in
`src/app/api/documents/schemas.ts` and `PostUpdateInput` in `src/types.ts`, so
the two halves of the seam agree the way they already do for `parentId` /
`seriesId` / `rank`: the mistake does not compile on the client, and
`documentUpdateSchema` being `.strict()` makes it a 400 naming the field on the
server. Create merely strips it — `documentCreateSchema` is not strict, because
callers legitimately post a whole `Post` through `toCreateInput`. The reason is
not the container-versus-patch argument those three fields rest on; it is that
any path such a write could store would name a file that cannot exist. Import
still sets the column, through the repository rather than the route.

Two consequences worth stating, because both are subtractions from documents
that argue the opposite:

- **The backgrounds volume was protecting dead data.** `production-deployment.md`
  §2's live-bug fix (`118a5a8c`) was still the right call when it was made —
  "do not silently destroy 19 MB on every rebuild" beats "investigate first" —
  but the backup set in §5 is one volume smaller than it says, and step 7's
  "migrate the existing 19MB of uploads onto the volumes" is now ~180 KB.
- **`src/lib/uploads.ts` no longer has two roots**, so its docblock's
  public/private split is history rather than structure. The rule it exists to
  state is unchanged and now unconditional: nothing private goes under `public/`,
  because the static tree is served with no session and no authorization check.

#### Attachments: not migrated, and the blocker is not effort

180 KB, no duplication, so none of §1's argument reaches them. That alone would
only make it low priority. What makes it a *design* question is one route:

**`PUT /api/attachments/[filename]` edits text attachments in place.** Content
addressing cannot express that. The key *is* the content, so "write new bytes to
this file" has no meaning in the store — the operation necessarily becomes:
hash the new content, `putBlob` it, rewrite every reference to the old hash in
the owning document's content, and `reconcileDocumentBlobs`. That is a different
feature, not a port of this one, and its failure mode is the bad kind: a
reference the rewrite misses leaves a document pointing at bytes the collector
will remove seven days later. Same hazard §3.1 records for the scan, arrived at
from the other direction.

What migrating *would* buy, so the trade is on the record rather than implied:

- **Authorization stops riding on the filename.** Today it rides on
  `attach_<documentId>_<random>.<ext>` — `src/app/api/attachments/access.ts`
  recovers the owning document by regex, which is what made these routes
  authorizable at all after they had no session check whatsoever. It works, and
  it is a property the filename has to keep carrying. `BlobRef` is the stronger
  model: it survives forks and deduplication, neither of which a name encoding
  one document id can represent.
- **The machinery already reaches them.** Attachment URLs live in the node `src`
  inside revision JSON, so `blobHashesFor` would pick them up with no new scan
  arm; reconciliation and collection would cover attachments for free.
- **One durability story instead of two.** §5 backs up a volume solely for this.

**The trigger to revisit is the one `production-deployment.md` §2 already names:
a second app instance**, or an in-place-edit answer arrived at deliberately. Until
then a volume is the right home for 180 KB, and adding `var/uploads` to the
nightly backup buys the durability without the rewrite.

One loose end left by the background removal, since resolved: `safeBasename`
(`src/lib/safePath.ts`) lost its only *external* caller with the import route's
restore block — that one needed a bare basename to look an entry up inside a zip,
where there is no directory to resolve against. The function is not dead
(`resolveWithin` calls it on its first line), so it was unexported rather than
deleted. Every remaining route from a hostile filename to the disk ends in a real
directory, which makes `resolveWithin` the single entry point and its second
check — re-resolving against `dir` — unskippable. That is a small tightening
rather than a cleanup: an export nobody uses is an invitation to take the first
half of the guarantee without the second.

## 11. Phasing

Each phase is independently shippable, and 1–3 is where the 25× lands.

**Phase 1 — the store, with no callers. DONE 14 Aug 2026.** `Blob`/`BlobRef`
schema and migration, `src/lib/storage.ts`, `src/repositories/blob.ts`,
`requireBlobRead` in `src/lib/access.ts`, `GET /api/blob/[hash]`, MinIO +
bucket-init in `docker-compose.yml`, `S3_*` in `.env.example`. Verified against
MinIO: bytes round-trip, re-hashing the fetched bytes reproduces the key, a
second `put` is a no-op, a presigned GET serves the same bytes, and a
traversal-shaped key is refused before any request leaves the process. §7.1
records the one design correction the build produced.

**Phase 2 — new writes go through it. PARTIALLY DONE 14 Aug 2026.**

- **Done:** `POST /api/blob` (upload) and `POST /api/blob/link` (the dedup
  fast path), `recordBlob`/`linkBlobToDocument`, the shared client helper
  `packages/editor/src/utils/uploadBlob.ts`, and **two of the three producers** —
  insert-image and paste/drag-drop. Both now store bytes once and reference
  them, falling back to the old data URI whenever there is nothing to upload to.
- **Not done, deliberately:** sketches — see §6.1, which is a finding, not a
  postponement. Also attachment upload and background upload, which are a
  separate slice: neither *duplicates*, so neither contributes to the growth
  this phase exists to stop. That slice is now closed — §10.2, and neither half
  of it ends in the store.
- **Reconciliation on save: DONE 15 Aug 2026.** `src/lib/blobRefs.ts` (the scan,
  the plan and the grace period, all import-free and specced in
  `src/lib/__tests__/blobRefs.test.ts`), `reconcileDocumentBlobs` in
  `src/repositories/blob.ts`, and `Revision.blobHashes` with its backfill.
  §3.1 and §3.2 record what building it corrected — the union over history, the
  11 MB measurement that ruled out recomputing it from `data`, and why the
  reference and not only the blob needs a grace period.

  Wired at every write that changes the set of revision rows or their content,
  which is the invariant the whole mechanism rests on: the two document routes,
  the two revision routes, `upsertProposal`, `approveProposal`, `rejectProposal`,
  `agentWrites`'s `create_post`, and import. Verified against the local Postgres
  by a throwaway script, not a spec — that both blobs are recorded, that a
  fresh reference survives the grace window and an aged one does not, that a
  blob only *history* mentions is kept and goes when that revision does, and
  that a hash with no stored bytes is skipped rather than failing the batch.

**Phase 3 — migrate what exists. DONE for images 15 Aug 2026; the two SVG types
are held back on one decision, §10.1.** `prisma/scripts/migrate-blobs.ts`
(`pnpm blobs:migrate status | run [--dry-run] | verify`), on the walk in
`src/lib/blobMigration.ts` — specced separately, because a node it fails to see
keeps its bytes and a node it rewrites that cannot render a URL becomes an empty
picture in a published post.

It lives in `prisma/scripts/` rather than §10's `scripts/`, with the three other
scripts that open a database connection; `scripts/` is lint-style checks that do
not.

Run against the dev database, after a dump: **1 document, 67 revisions, 67
occurrences of one 117 kB PNG.** The database went **34 MB → 19 MB** and
`Revision` **23 MB → 8.6 MB** (after a `VACUUM FULL`, which the reclaim needs —
the rewrite only makes the rows dead). `verify` passes all four checks, and the
stored object was fetched back and re-hashed to its own key.

What is left in place, on purpose: 64 `sketch` and 13 `graph` occurrences, 3.1 MB
— §10.1. Also attachments and backgrounds (step 5), which is the same separate
slice phase 2 named: neither duplicates, and moving them means porting the two
serving routes, not rewriting revision JSON. **Resolved 27 Aug 2026 in §10.2:
backgrounds were deleted (a removed feature's orphans, ~19 MB) and attachments
stay put, so step 5 closes with nothing added to the store.** This dev database has no
`background_image` set at all, so §10's "~20 MB of deduplicated objects" is a
production-only figure.

**Phase 3 makes phase 4 urgent rather than optional.** Three consumers still
assume `src` is a data URI, and the first is not a degradation:

- **docx export throws** — `$convertImageNode` does `Buffer.from(src.split(",")[1],
  "base64")` on what is now a URL. True since phase 2 for newly inserted images;
  the migration extends it to the one post that already had one. Left loud
  rather than made to skip the image silently, which in an export is worse.
- **backup bundles are no longer self-contained** — `/api/export` bundles
  `assets/attachments` and `assets/backgrounds` but knows nothing about blobs, so
  a restored bundle references bytes it does not carry. `/api/import` already
  reconciles whatever the target deployment happens to hold (§3).
- **`localBackend` has no blob store**, so guest drafts still fall back to data
  URIs — deliberate, and §8.

**Phase 4 — parity. DONE 15 Aug 2026, except that §8's local blob store turned
out not to be the shape the problem has.**

- **docx** — `generateDocx(data, blobs)` takes the bytes, because the conversion
  is one synchronous `editorState.read` and cannot fetch. `/api/docx/[id]`
  resolves them with `loadBlobs` beforehand;
  `packages/editor/src/utils/docx/blobs.ts` carries them across the read the same
  way `listNodes` already carries state. An image whose bytes cannot be found
  exports as its **alt text** rather than throwing — the whole-document failure
  was the wrong trade once there was a right answer to fall back from. Verified
  over HTTP against a published fixture: the .docx contains
  `word/media/*.png` at the blob's exact size, and a reference to a hash the
  store has never held returns 200 with the alt text in `word/document.xml`.
- **`/api/export`** — `assets/blobs/{hash}` plus `referencedBlobs` on each
  document. The field carries `{hash, mimeType, size}` and not a bare hash: the
  zip entry is raw bytes under a hash, so a bare list would leave import
  guessing what it holds, and the guess would end up on the `Content-Type` of
  every later response. Blobs are collected from the **revision JSON**, not from
  `BlobRef`, so a drifted reference row cannot make a backup incomplete; a blob
  the store cannot produce is named in the manifest's `missingBlobs` rather than
  silently omitted. Schema version → `2026-08-15`.
- **`/api/import`** — restores those bytes, and **re-hashes every one of them**.
  The filename inside an uploaded zip is a claim, not evidence; storing bytes
  under a hash they do not have would poison every future deduplication of that
  key, which is the same attack `POST /api/blob` refuses by hashing what it
  receives. A mismatch is refused with a warning rather than stored under its
  true hash, because the documents reference the claimed one regardless.
- **Content arriving inline** — `src/lib/blobIngest.ts`. Two paths still deliver
  data URIs (a guest draft signing in, an old bundle), and without this both put
  back exactly what phase 3 removed, to start growing again on every save. It
  runs on `POST /api/documents` and on each revision an import creates, reuses
  the migration's walk, and leaves the content alone when there is no store
  configured.

### 11.1 §8 is answered rather than built

§8 planned a `blobs` sub-interface on `PostBackend` and an IndexedDB blob store,
on the premise that "documents stop being self-contained here, so local storage
has to carry the bytes explicitly."

**That premise did not survive phase 2.** `uploadBlob` falls back to a data URI
whenever there is nothing to upload to, and a signed-out browser is exactly that
case — so local documents never stopped being self-contained, and the cost §8
called honest was never actually paid. Building the local store now would create
the problem it was designed to solve.

What was missing was not storage but **conversion at the boundary**, and there
are four of them. All four now hold:

| Crossing | What happens |
| --- | --- |
| cloud → zip | bytes bundled under `assets/blobs/{hash}` |
| zip → local | inlined back to data URIs (`inlineBlobUrls`) |
| local → cloud | inline images ingested as blobs (`ingestInlineBlobs`) |
| zip → cloud | bytes restored to the store, hash re-verified |

The invariant is one sentence: **the cloud stores an image once; a local document
carries its own.** §8's closing claim still holds and is what makes the local →
cloud crossing an upload rather than a rewrite — the hash is the same on both
sides of the seam.

The rest of §9 needed nothing. `/api/og` renders the author's avatar and a static
logo, never document images. `/pdf/[id]` redirects to `/embed`, so the reader's
own browser fetches the image under their own session and `/api/blob/[hash]`
authorizes it exactly as it does in the app.

**Phase 5 — GC. Built 15 Aug 2026; the scheduling half is open, §11.2.**
`deleteBlob` in `src/lib/storage.ts` (the
only destructive operation in the module, and the only one with no caller on a
request path), the rule in `src/lib/blobGc.ts` with
`src/lib/__tests__/blobGc.test.ts`, and
`prisma/scripts/collect-blobs.ts` (`pnpm blobs:collect status | run
[--dry-run]`).

The collector's own grace window is **7 days** (`BLOB_GC_GRACE_MS`), which
answers the second half of §13. §3.2's 24 hours protects a *reference* during
upload-before-save; this protects a blob that has **no reference at all**, which
that grace cannot reach because there is nothing there for it to hold. That
state is ordinary rather than exceptional — `ingestInlineBlobs`, `/api/import`
and `migrate-blobs.ts` all write the `Blob` row before any document can point at
it — and the way those gaps get long is that the batch job died and a person has
to re-run it, which is an operator's timescale and not a request's. A day does
not survive a Friday-evening import failure. The window must in any case exceed
`BLOB_REF_GRACE_MS`, since a blob is always at least as old as its youngest
reference, and a spec asserts that ordering so shortening it fails rather than
quietly disarming §5.

The query is deliberately **unfiltered** — every blob with its reference count,
decided in `blobGc.ts`. Asking Postgres for "the collectable ones" would put half
the rule in a `where` clause, and §13 has already ruled on what two spellings of
one blob rule cost.

**One correction to §5.** The deletion order it names is right and is what was
built, but the sentence justifying it describes the wrong leftover: an orphaned
*object* is the residue of the **reverse** order, not of this one. The actual
argument is that the row is the only handle on the object — the key is derivable
from nothing else — so dropping the row first and then failing on the object
leaves bytes nothing in the database names and no later run can find. Object
first leaves a `Blob` row whose object is gone, which is visible (`blobs:migrate
verify` reports it), harmless (a `Blob` is only reachable through a `BlobRef`,
and it has none), and self-healing (the next run deletes an already-absent
object, which the store treats as success).

Verified against the local MinIO and the dev database: bytes round-trip and
delete, a second delete of the same key succeeds, a traversal-shaped key is
refused before any request leaves the process, and `run` refuses outright with
no store configured.

Then against a store deliberately populated with two orphans — one aged past the
window, one minutes old — alongside the real referenced blob. `status` sorted
all three correctly; `run --dry-run` named the aged one and deleted nothing;
`run` took its object and its row and left the other two, references included.
Finally the interrupted-run claim above, which the whole ordering argument rests
on: with the object deleted by hand and the row left behind, the next `run`
collected the row and reported no failure, because deleting an absent key
succeeds.

### 11.2 The collector has nowhere to run yet

§11's phase 5 is "§5, plus the scheduled job and its log". The job and the log
exist; **the schedule does not, and it is blocked on something outside this
plan.**

There is no scheduling infrastructure in this repo at all — no cron, no timer
unit, no `schedule:` workflow, no scheduler dependency. That is not an oversight
to correct here, because there is also nothing deployed to schedule *on*:
[production-deployment.md](./production-deployment.md) §9 has steps 5–9
outstanding, so the VPS does not exist yet.

The non-obvious part, and the reason this is recorded rather than left to be
rediscovered: **the collector cannot run inside the production container as the
image is built.** `Dockerfile`'s runner stage copies `.next/standalone`,
`.next/static`, `public` and the Prisma client — not `src/`, and not `tsx`. Every
script in `prisma/scripts/` imports app modules by relative path and is executed
through `tsx`, so `docker compose exec app pnpm blobs:collect` fails on a box
where it would otherwise be the obvious move.

Two mechanisms actually fit, and the choice belongs with the deployment work:

- **Ship the script into the image** — add `src/` and `tsx` to the runner stage,
  then a host cron entry running `docker compose exec`. Cheapest to reason about;
  costs a source tree and a dev dependency in the production image to run one
  weekly job.
- **Expose it behind an authenticated route** that cron `curl`s. No image change,
  and `/api/mcp`'s agent tokens already exist as a credential with scopes. But it
  puts the one destructive operation in this system on an HTTP surface, which
  wants more care than a script that only an operator can start.

It pairs naturally with the nightly backup in production-deployment.md §5, which
needs a scheduler for the same reason and does not have one either. Until then
the collector is a thing an operator runs, and nothing collects on its own —
which is the safe direction for the failure to point.

**Answered 31 Aug 2026, and by a third mechanism neither bullet named.**
`production-deployment.md` §10 chose systemd timers, and the image problem is
solved by a `profiles: ["ops"]` service in `docker-compose.prod.yml` that builds
the Dockerfile's *builder* stage — which already has `src/` and `tsx`, because
that is the stage that compiled the app. So the runner image gains nothing, no
destructive operation goes on an HTTP surface, and every other script in
`prisma/scripts/` becomes runnable in production as a side effect (minting an
agent token, rotating an AI key — neither was possible before).

One thing that section adds which this one did not think to ask for: because the
collector is the only thing in the system that ever deletes an object,
`ops/blobs-collect.sh` **refuses to run** unless an offsite copy of the bucket is
on record and recent. The ordering that §5 states in prose is a precondition that
fails closed. Nothing is scheduled until the box in §9 step 5 exists, so the last
paragraph above still describes the tree.

## 12. What this supersedes

- **`archive/storage-uploads.md` is superseded, not merely deferred.** Its scope
  boundary — §What stays in Postgres — was the right call under a
  backcompat constraint that no longer applies, and §1 shows the excluded class
  held most of the bytes. What survives and is carried forward here: the S3-SDK
  choice, the two-bucket split, the presigning security analysis, and the
  route inventory. What is dropped: the seven-route port as a standalone change,
  since those routes are now rewritten against the blob store instead.
- **`production-deployment.md` §2** ("uploads stay on the filesystem") no longer
  describes the target — but it does still describe what to deploy.

  **Corrected 15 Aug 2026.** This used to say the upload volumes "become empty"
  once phase 3 completes. Phase 3 has completed and they have not, because the
  class it migrated — editor images inside `Revision.data` — was never on the
  filesystem in the first place. §10 step 5, attachments and backgrounds, was
  deliberately skipped: neither duplicates, so neither contributes to the growth
  this plan exists to stop. **Both volumes still hold every byte they held
  before**, and unmounting one on the strength of "phase 3 is done" would delete
  live data.

  What the deployment gained instead is a new prerequisite, recorded there as
  §2.1: the blob store is no longer an improvement awaiting its turn but the
  place the images in every post live, so `S3_*` must be configured before the
  first deploy and the bucket is primary data that §5's backup has to cover.

## 13. Open questions

- **Client-side hashing.** `crypto.subtle.digest("SHA-256", …)` is available in
  every supported browser and is what makes the "check before upload" in §6
  possible. Confirm it is acceptable on large files on a slow device, or hash in
  a worker.
- ~~**Does `BlobRef` recomputation belong in the save path or a trigger?**~~
  **Answered: the save path.** A trigger would have to compute the reference
  list from `data` in SQL, which means a second spelling of the pattern
  `src/lib/blobRefs.ts` scans for — two definitions of the one rule that must
  not drift, where drifting means collecting a blob that is still in use. The
  save path already holds the content in memory, so the list costs nothing to
  derive there. The migration's backfill is the one place the SQL spelling
  exists, and it runs once.
- ~~**Grace period length** for §5.~~ Answered twice, because it was two
  questions. The *reference* window is 24 hours (§3.2) and covers
  upload-before-save. The *collector's* window is 7 days (`BLOB_GC_GRACE_MS`,
  §11 phase 5) and covers a blob that has no reference at all — the state every
  bytes-before-rows path passes through, and the one that gets long on an
  operator's clock rather than a request's.
- **Should backgrounds move to the public bucket and lose `/api/`?** They are
  public by design and 19 MB of the 20. Serving them straight off the R2 public
  URL removes the box from the path entirely — but bakes a hostname unless a
  rewrite fronts it, which is `archive/storage-uploads.md`'s option 2 again.

---

## 13. §10.1 decided — 31 Aug 2026: migrate both

**Yes, and both types together.** `graph` and `sketch` join `image` in
`MIGRATABLE_TYPES`. §10.1 left this as the last open question in the plan; it is
answered on measurement rather than on the estimate §10.1 was written with.

### 13.1 What the corpus actually is

Measured against the live dev database at `44227263`, after the image migration:

| | |
| --- | --- |
| Occurrences of an SVG data URI | **77** |
| Distinct SVGs behind them | **5** |
| Stored, as revision JSON | **3852 kB** |
| Deduplicated | **396 kB** |
| The same revisions on disk (TOAST-compressed) | 1848 kB of a 9136 kB `Revision` table, in an 18 MB database |

The split by type is not what §10.1's framing suggests. **Two graphs are 54% of
the bytes in 13 of the 77 occurrences** — 88 kB and 242 kB apiece — while three
sketches carry the remaining 1.9 MB across 64. So the half that is cheapest to
migrate is also the heavier half: GraphNode has guarded on the data-URI prefix
in both `decorate` and `exportDOM` since it was written, which makes graphs a
one-line change to a `Set`.

### 13.2 The property that decides it

All five distinct SVGs were decoded and inspected. **Not one references anything
outside itself.**

- The two graphs (Geogebra) have no `<style>`, no `@font-face`, no external
  `href`, no nested `data:` — plain paths and text.
- The three sketches (Excalidraw) each carry exactly one `<style>` holding one
  `@font-face` whose `src` is a **`data:font/woff2;base64`** URI. No external
  reference either.

That is the whole question. An inline `<svg>` may depend on the page it is
inlined into; an `<img>` cannot — SVG-as-image is rendered in secure static mode
with no external fetches. A picture that reaches outside itself therefore cannot
be migrated at any price, and neither of these does. §10.1 correctly identified
that the decision is about rendering rather than about bytes, and then did not
ask the question that settles it.

A related finding, worth stating because it makes the change an improvement
rather than a wash: **every current render path strips the `<style>`** —
`SketchNode.exportDOM`, `GraphNode.exportDOM` and `ImageComponent`'s svg branch
all `querySelectorAll("style")` and remove. They must, because inlining injects
that `@font-face` into the host document. So a sketch's text renders in a
fallback font today. As an `<img>` the style is scoped to the image, and the
embedded font applies. **This is the one thing to look at in a browser** (§13.5).

### 13.3 What it costs, and what it does not buy

The code is one guard, in the two places `SketchNode` decodes `__src` without a
fallback — the same guard `GraphNode` carries, and its absence is the entire
reason sketches were held back. `decorate` picks `element="img"`, `exportDOM`
delegates to `ImageNode`'s. Everything else was already generic:

- **The docx path needs no change.** `imageData` resolves a blob `src` through
  `resolveBlobSrc` and `typeFromMime("image/svg+xml")` already answers `"svg"`.
- **The blob route is already safe for SVG.** It sets
  `Content-Security-Policy: default-src 'none'; sandbox` and
  `X-Content-Type-Options: nosniff`, so serving user SVG from the app's own
  origin is not a new XSS surface — the one objection that would have blocked
  this outright, and it was answered before the question was asked.
- **`blobHashesFor`, `reconcileDocumentBlobs` and the collector** cover these
  nodes by URL with no new arm.

**It does not simplify anything.** The inline-SVG path stays forever: a guest's
documents keep their data URIs by design (§11.1), so both forms must render. Any
argument for this that rests on deleting a branch is wrong.

### 13.4 Why it is worth doing at 1.8 MB when the images were worth 15 MB

It is not the same size and it is the same *mechanism*. Every save of a document
rewrites its pictures into a new `Revision` row, so the 242 kB graph costs 242 kB
per revision, forever, on a document that is still being edited. That is exactly
how one PNG became 10 MB across 67 copies (§1) — the corpus here is 13
occurrences only because those documents have been edited less. The work is
bounded now; the cost is not.

### 13.5 How to land it, and the acceptance criterion

1. **`pg_dump -Fc` first.** §10 already says it: the migration rewrites every
   revision in the database, and §5's grace period does not protect against a bad
   rewrite.
2. `pnpm blobs:migrate run --dry-run`, then `run`.
3. **Verify in a browser, which is the whole risk.** A sketch and a graph, in the
   editor, in `/view`, and through a `.docx` export. The specific thing to look
   at is a sketch containing text: with the `<style>` no longer stripped it
   should render in Excalifont rather than the fallback it uses today. Different
   from today is expected; *wrong* is not.
4. If a sketch renders wrong, drop `"sketch"` from `MIGRATABLE_TYPES` and keep
   `"graph"`, which needs no guard and carries more than half the bytes. That
   would be a decision on evidence, not a reversal of this one.

The guard and the `Set` landed on 31 Aug 2026; **the migration has not been
run**, and until it is, every SVG in the database is still inline.

### 13.6 The run — 31 Aug 2026

Done, on the dev database, in the order §13.5 asked for.

| | |
| --- | --- |
| Documents rewritten | 2 |
| Revisions rewritten | 47 |
| Occurrences replaced | 77 |
| Distinct blobs stored | 5 (all SVG) |
| Revision JSON freed | 3.0 MB |
| `Revision` on disk | 9136 kB → **7120 kB** after `VACUUM FULL` |
| Database | 18 MB → **17 MB** |

The on-disk figure is a third of the JSON figure because TOAST already
compressed the SVG text well — worth stating, because "3.0 MB freed" is what the
script prints and it is not what the disk gives back. **The write-amplification
argument in §13.4 is unaffected by that**: what a future save no longer writes is
the 3.0 MB, before compression.

The rehearsal was a real one. `pg_dump -Fc` → restore into a throwaway
`postgres:17` → run there → `verify` → inspect, and only then the live database.
Both runs reported identical numbers, and the four `verify` checks passed on
each. Two things were checked that `verify` does not:

- **The stored bytes are the decoded original, unchanged.** A sketch blob still
  carries its `<!-- payload-start -->` block, its one `<style>` and its one
  `@font-face`; a graph blob is the plain SVG. §10.1's promise that migration
  moves the payload rather than destroying it, confirmed on the bytes.
- **The bookkeeping the collector depends on.** 114 revisions carry
  `blobHashes`, and there are 6 `BlobRef` rows for 6 blobs.

**The browser pass followed the same day and passed — §13.7.** Until it ran this
was verified as a *data* migration and unverified as the *rendering* change it
also is; it is now verified as both.

#### A leak class the collector cannot reach

Reconciling the bucket against the `Blob` table found **two objects with no row**
(`a4b4da04…`, `ebf4f635…`), predating this run — the reverse direction, a row
naming bytes that are not there, is empty. `pnpm blobs:collect` cannot reap
these: it walks rows, and the row is the only thing that names the key (§5). The
shape follows from two deliberate orderings — the migration stores bytes before
rows, and collection deletes the object before the row — so an interruption in
either window leaves exactly this. Both orderings are right, because the
alternative failure is a post rendering an empty picture. Recording it because
the only way to find these is a bucket-to-table reconcile, which nothing does on
a schedule; `ops/restore-drill.sh` does the comparison monthly but only reports
the direction that matters for a restore.

### 13.7 The browser pass — 31 Aug 2026, and it passes

§13.5 step 3, run against a dev server on `:3005` (`BUILD_DIR=.next-verify`, so
the stale `next start` on `:3000` was left alone). Both migrated documents, both
node types, all three render paths.

| Path | What it emits now | Result |
| --- | --- | --- |
| `exportDOM` (`/view`) | `<img src="/api/blob/…">` | Renders. 0 `data:image` left in the HTML |
| `decorate` (the editor) | `<img>`, `element="img"` | Renders. `naturalWidth` 2717 / 1538 / 1670 — the browser decoded every one |
| `.docx` | embedded SVG | 200, media entries at exactly the blob sizes (28725, 18616, 66757) |
| `GET /api/blob/<hash>` | the bytes | 200, `image/svg+xml`, `nosniff`, `default-src 'none'; sandbox`, `public, immutable` |

**The acceptance criterion §13.5 named is met, and it is the predicted change and
nothing else.** Rendering the same sketch both ways side by side — the old inline
`<svg>` with its `<style>` stripped, against the new `<img>` — the geometry is
pixel-identical: every box, arrow and stroke in the same place. The single
difference is the text, which was falling back to a serif face and now renders in
Excalifont. §13.2 predicted exactly this: the strip was forced by inlining, and
an `<img>` scopes the style to the image, so the embedded `data:font/woff2` face
finally applies.

**Dark mode survives, and by construction rather than by luck.** The rule is
`html.dark .LexicalTheme__image.LexicalTheme__darkModeFilter :is(img, svg)` —
it already named both branches, so the invert follows the picture across the
change. Verified as computed style: `invert(0.93) hue-rotate(180deg)` on the
migrated `<img>`, and the sketch reads correctly on the dark ground.

#### Two things found in passing, both pre-existing

Neither is caused by this change, and neither is fixed here.

- **A caption with an indent had no line box left** — recorded here as "the
  floated caption bug" and then run down; the float was a red herring and so was
  `/view` looking fine. §13.8 is the diagnosis and the fix.
- **The `.docx` SVG fallback is not a PNG.** `docx/image.ts` passes
  `fallback: { type: "png", data }` with the same buffer whatever `type` is, so
  an SVG picture ships a "PNG" fallback that is SVG bytes. Unchanged since at
  least June 2025 and identical before the migration — a Word old enough to use
  the fallback would show a broken picture.

Also observed on every editor load, unrelated to any of this:
`NodeSelectionPlugin: The following nodes are not registered: TableNode,
AttachmentNode`.

### 13.8 The caption bug §13.7 found — diagnosed and fixed

The symptom §13.7 recorded was "a floated image's caption wraps one character per
line in the editor". **Two things about that description were wrong**, and both
mattered to the fix.

**It is not the float.** The `<img>` was swapped in the live DOM for an inline
`<svg>` of an identical box and the caption did not move — the same 356 × 524
either way — which ruled out the migration and, by construction, the element. It
also ruled out the float, once the boxes were actually measured: the `figure`,
the `figcaption` (356) and the caption's paragraph (336) were all the right size.
The text was not being squeezed by its container.

**It was the content.** The caption's paragraph carries `indent: 8` in the
stored editor state, and Lexical writes an indent as
`padding-inline-start: calc(8 * var(--lexical-indent-base-value, 40px))` — **320
px of the 336 px box**, leaving a 16 px line box. `--lexical-indent-base-value`
is 40px because it is sized for full-width prose; a caption is the picture's
width. The other document's caption is `indent: 0, format: center` and was
always fine.

**And `/view` was never fine either**, which the §13.7 note got wrong from a
screenshot. It carries the same indent — `exportDOM` resolves the calc to a
literal `padding-inline-start: 320px` — and simply has a wider figure, so the
caption is shoved against the right edge instead of collapsing. Same defect,
flattering geometry.

That last fact decided the fix. Scoping `--lexical-indent-base-value` down inside
a caption is the tidy option and it would have fixed **only the editor**,
creating a divergence between the two renderers where there was none: export
writes a literal with no variable left to redefine. So the rule zeroes both
shapes — `.LexicalTheme__indent` (editor) and `[data-lexical-indent]` (export) —
inside `.LexicalTheme__image figcaption`, with `!important`, because the
competing declaration is an inline style that no selector can outrank.

**A caption does not indent, then.** The cost is that a deliberate caption indent
is discarded; that is accepted, because a caption is one short line under a
picture with no outline structure to express, the nested editor offers
indentation only by reusing the paragraph theme, and the failure it replaces is
silent — nothing in the UI says why the text has gone vertical.

The author's content is left alone. `indent: 8` is still in the stored caption;
it now renders as nothing rather than as a wrecked line box, and fixing the data
instead would have left the next accidental Tab to reproduce it.

Verified in the browser both ways: the caption's paragraph went from 336 × 504
to 336 × 24 with the text on one line, `/view` moved it back under the figure
from the right edge, and the other document's centered caption is untouched at
44 px.
