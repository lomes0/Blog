# Blob storage: one content-addressed store for every byte

Status: **decided**, not started. Decided 2026-08-13, after measuring the live
database (§1). Supersedes
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
publicBlobUrl(hash): string
```

On `@aws-sdk/client-s3` against `S3_ENDPOINT`, per `archive/storage-uploads.md`'s
reasoning — which has now survived three hosting reversals and been used twice.
**Two buckets stay**, for the reason that file already gives: public for
CDN-cacheable content, private for anything gated, because public access is
granted per bucket and not per prefix.

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

## 11. Phasing

Each phase is independently shippable, and 1–3 is where the 25× lands.

**Phase 1 — the store, with no callers.** `Blob`/`BlobRef` schema,
`src/lib/storage.ts`, `GET /api/blob/[hash]` with `requireBlobRead`, R2 wiring,
MinIO in the dev compose. Verifiable in isolation.

**Phase 2 — new writes go through it.** The three data-URI producers (§6),
attachment upload, background upload. From here the problem stops growing.

**Phase 3 — migrate what exists.** §10. This is the phase that reclaims the
13 MB.

**Phase 4 — parity.** Export inlining, import, docx, and the `localBackend`
blob store (§8). The largest phase, and the one that keeps offline working.

**Phase 5 — GC.** §5, plus the scheduled job and its log.

## 12. What this supersedes

- **`archive/storage-uploads.md` is superseded, not merely deferred.** Its scope
  boundary — §What stays in Postgres — was the right call under a
  backcompat constraint that no longer applies, and §1 shows the excluded class
  held most of the bytes. What survives and is carried forward here: the S3-SDK
  choice, the two-bucket split, the presigning security analysis, and the
  route inventory. What is dropped: the seven-route port as a standalone change,
  since those routes are now rewritten against the blob store instead.
- **`production-deployment.md` §2** ("uploads stay on the filesystem") no longer
  describes the target. The upload volumes stay in the compose file until phase
  3 completes, then become empty — keep them mounted until §10's verification
  passes, and delete them in the same commit that deletes the local files.

## 13. Open questions

- **Client-side hashing.** `crypto.subtle.digest("SHA-256", …)` is available in
  every supported browser and is what makes the "check before upload" in §6
  possible. Confirm it is acceptable on large files on a slow device, or hash in
  a worker.
- **Does `BlobRef` recomputation belong in the save path or a trigger?** The
  save path is simpler and keeps it in one language; a trigger cannot be
  forgotten. Decide when phase 2 lands.
- **Grace period length** for §5. Long enough to cover an upload-then-save gap,
  including a slow client that uploads and then leaves the tab open.
- **Should backgrounds move to the public bucket and lose `/api/`?** They are
  public by design and 19 MB of the 20. Serving them straight off the R2 public
  URL removes the box from the path entirely — but bakes a hostname unless a
  rewrite fronts it, which is `archive/storage-uploads.md`'s option 2 again.
