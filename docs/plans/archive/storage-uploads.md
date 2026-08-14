# Storage Support: moving uploads off the filesystem

Status: **SUPERSEDED 2026-08-13 by [../blob-storage.md](../blob-storage.md).**
Read that first; this file is archived for the reasoning it carries forward, not
as a plan to execute. It was never built.

**Why it was superseded, and it is not that the design was wrong.** This plan
moved two asset classes and drew an explicit scope boundary around the third
(§What stays in Postgres — editor images as base64 data URIs in `Revision.data`),
because moving it changes the document format. Measuring the live database
showed that excluded class holds **most of the bytes**: six distinct images
stored 141 times, 13.6 MB, one PNG accounting for a third of the whole database.
The boundary was correct under a backward-compatibility constraint. That
constraint was lifted on 2026-08-13, and with it the reason to leave the largest
problem outside the plan.

**What blob-storage.md carries forward from here:** the S3-SDK-over-vendor-SDK
choice, the two-bucket split and why it is per-bucket, the presigning security
analysis, MinIO for local parity, and the backgrounds backfill asymmetry. **What
it drops:** the seven-route port as a standalone change — those routes are now
rewritten against a content-addressed store instead of a path-keyed one.

---

Original status: **deferred** — a considered not-yet, with a named trigger below,
not a backlog item. Written 2026-07-30 during production readiness work. Revised
2026-07-30 — re-checked against the tree after the `UPLOADS_DIR` split landed;
migration and security sections corrected, scope boundary made explicit
(§What stays in Postgres).

**Re-statused 2026-08-13 (second revision that day): DEFERRED — not a blocker.**
The hosting premise moved twice in one day. It went Fly + R2 → Vercel + Supabase
(morning) → **a single VPS running Docker Compose** (afternoon,
`docs/plans/production-deployment.md`). The morning's rewrite made this document
a hard prerequisite; the afternoon's decision hands that back.

**Why it stops being urgent.** The two failures §Problem opens with are both
answered by a named Docker volume on one box: a volume outlives
`docker compose up --build`, and there is exactly one instance. The third —
"serverless has no writable filesystem" — does not apply at all. So this returns
to being the improvement it was on 30 July. Seven route rewrites, a presigning
flow and a migration script are not justified by 19MB of data that a volume
already keeps safe.

**What replaces it, today:** two volumes in `docker-compose.prod.yml`, one per
upload root. That is the whole fix, and it closed a real bug — the prod compose
mounted a volume only over `ATTACHMENTS_DIR` (180KB/11 files) and left
`BACKGROUNDS_DIR` (19MB/70 files) in the container's writable layer, to be
destroyed on every rebuild.

**The revisit trigger**, so this is a decision and not a shelving:

- a second app instance, or
- moving to a CDN origin, or
- uploads past a few GB, where backing up a volume stops being cheap.

**What this costs, and it is real:** durability is now entirely the backup job
(`production-deployment.md` §5), where an object store would have provided it
from the vendor. That is the trade being made knowingly.

**The vendor question is now open again**, because nothing forces it. Supabase
Storage was chosen when Supabase held the database; it no longer does. When the
trigger fires, prefer whichever object store is already holding the offsite
backups — Backblaze B2 or Cloudflare R2 — since that is one credential and one
vendor rather than two. Everything below about *how* to talk to it is unchanged:
the S3 SDK against an `S3_ENDPOINT` was chosen precisely so this paragraph could
be rewritten without touching code.

**What survives all three reversals** — and it is most of this document: the
security analysis, the backgrounds backfill asymmetry, the route inventory and
the scope boundary in §What stays in Postgres. None of them was ever about the
host.

## Problem

Uploaded files are written to the app's own filesystem, while only a path string
is persisted to Postgres. The two have different lifetimes, and neither is
shared between instances.

```ts
// src/app/api/documents/[id]/attachments/route.ts:58
await mkdir(ATTACHMENTS_DIR, { recursive: true });
await writeFile(filePath, buffer); // bytes → this instance
const fileUrl = `/api/attachments/${fileName}`; // string → the database
```

Both roots resolve under `process.cwd()` — `ATTACHMENTS_DIR` defaults to
`<cwd>/var/uploads/attachments` and `BACKGROUNDS_DIR` is
`<cwd>/public/uploads/directories` (`src/lib/uploads.ts`). Three consequences —
**all three now answered or inapplicable**, which is why this plan is deferred.
They are kept because they are the conditions to watch for, not history:

1. **Redeploys destroy data.** A new deployment is a fresh filesystem. Every
   uploaded file is gone; the DB rows survive and still point at
   `/api/attachments/attach_xyz.png`. The result is a database full of URLs that
   404 — silent loss, discovered later by readers.
   → **Answered by a named volume.** The container is replaced on redeploy; the
   volume is not. This was the failure mode that actually bit, and it bit
   because the volume covered only one of the two roots.
2. **Horizontal scale is impossible.** Two instances have separate filesystems.
   An upload lands on A; the next request routes to B, which has no such file.
   → **Not a present condition.** One instance. This is revisit trigger #1.
3. ~~**On Vercel there is no step 1 to begin with.**~~ Written for the serverless
   target and dead with it — a VPS has an ordinary writable filesystem. Kept
   struck through rather than deleted because it is the reason this document
   briefly read as a deploy blocker.

Currently on disk: **19MB across 70 files** in `public/uploads/directories`
(backgrounds) and **180KB across 11 files** in `var/uploads/attachments`. The
volume is almost entirely backgrounds; both need migrating.

## Constraints

Two standing requirements drove every choice below.

- **Local hosting must be configuration-identical to prod.** No
  filesystem-in-dev / object-store-in-prod adapter split — that is precisely the
  drift worth avoiding, because the code path that runs locally would not be the
  one that runs in production.
- **The app must not lag waiting on data.** Bytes must not stream through Node.
  Today every upload does `Buffer.from(await file.arrayBuffer())` (whole file in
  app memory) and every download does `readFile` then serves it — both occupy a
  request slot for the full transfer. On a box sized for one app, a large
  download holding a request slot is the constraint; there is no metered
  function duration any more, but there is finite concurrency.

## Decisions

Everything here is **conditional on the revisit trigger firing** — see the
header. The shape is settled; the vendor is not.

| Axis                | Choice                                                                     |
| ------------------- | -------------------------------------------------------------------------- |
| Backend             | **Open** — prefer whichever store already holds the offsite backups (B2/R2) |
| Client              | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, against `S3_ENDPOINT` |
| Local parity        | **MinIO in `docker-compose.yml`** — the dev stack is already Compose        |
| Upload path         | **Presigned direct-to-bucket PUT** — the app signs, the browser transfers   |
| Serve path          | **Public backgrounds, signed attachments** — two buckets                    |
| Size/type ceiling   | **Bucket-level limits**, not presign conditions — see the security note      |

### Why the S3 SDK rather than any vendor's own

Every candidate store speaks S3. Using the AWS SDK against an `S3_ENDPOINT` buys
two things worth more than any native client's convenience:

- **The escape hatch stays open** — and it has now been *used twice*. R2, B2, S3,
  MinIO and Supabase Storage are all the same code behind the same env vars, so
  a vendor change is an `S3_ENDPOINT` and a migration script rather than a
  rewrite. Three hosting decisions in two weeks is the argument.
- **One dependency, not two.** A vendor SDK tends to arrive carrying an auth
  client this app does not use — NextAuth owns sessions here, and a second
  identity library in the tree is a standing invitation to confusion.

Rejected, with reasons:

- **Postgres `bytea`** — satisfies local parity perfectly, but every byte then
  flows through Node _and_ the database connection. Fails the performance
  constraint, and bloats backups. Note this one is *newly awkward*: Postgres is
  now on the same box and the same disk, so it would not even buy durability.
- **Supabase Storage** (the morning's choice) — was right only because Supabase
  was holding the database. It no longer is, so it would be a new vendor for one
  small job, with no local story that Compose does not already provide.
- **Vercel Blob** — dead with the platform. No local emulator either.
- **Everything public** — fastest and simplest, but drops the existing access
  control on attachments. A security regression, not a tradeoff.
- **Keeping the filesystem forever** — the status quo, and correct *until* a
  trigger fires. Listed so it is understood as the current answer rather than an
  unconsidered default.

### Why two buckets

Every candidate store grants public access per _bucket_, not per prefix, and the
two asset classes already have different access rules today. **The split exists
in the code already** — `src/lib/uploads.ts` separates them onto two roots
precisely because one is authorization-gated and the other is not, and
`docker-compose.prod.yml` now mirrors that split as two volumes.

Buckets are also where a size/MIME ceiling can be enforced server-side, which is
where the upload ceiling belongs (see the security note).

### The caching tradeoff

Signed URLs are unique per issue, which defeats CDN caching. That is acceptable
for attachments (accessed rarely, must stay gated) and unacceptable for
backgrounds (rendered on every page view). Splitting by bucket is what lets each
class get the right treatment rather than a single compromise.

On the current topology this matters less than it did: Cloudflare sits in front
of the origin (`production-deployment.md` §1.1) and caches
`/uploads/directories/*` off the static tree already. A public bucket would
change *where* backgrounds are served from, not *whether* they are cached.

## Target architecture

### `src/lib/storage.ts`

One S3 client, constructed from env, exporting:

```ts
presignPut(bucket, key, contentType, maxBytes): Promise<string>
presignGet(bucket, key, expiresIn): Promise<string>
publicUrl(key): string
putObject(bucket, key, body, contentType): Promise<void>
getObject(bucket, key): Promise<Buffer>
objectExists(bucket, key): Promise<boolean>
```

New dependencies: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.

### Environment

```
S3_ENDPOINT=          # vendor endpoint; http://minio:9000 locally
S3_REGION=            # the real region — some vendors reject "auto"
S3_ACCESS_KEY_ID=     # an S3 access key, never a vendor's admin/service token
S3_SECRET_ACCESS_KEY=
S3_BUCKET_PUBLIC=blog-public
S3_BUCKET_PRIVATE=blog-private
S3_PUBLIC_URL=        # public read base for the public bucket — see below
S3_FORCE_PATH_STYLE=  # true for MinIO and most non-AWS endpoints
```

`S3_PUBLIC_URL` is separate from `S3_ENDPOINT` because the public read path is
generally not the S3 path — vendors serve public objects from a CDN hostname
while the S3 endpoint handles signed operations. Keeping them apart is also what
lets the public hostname change without a data backfill (see §Migration).

**Use an S3 access key, never a vendor's admin or service token.** They are
separate credentials from separate screens, and reaching for the powerful one is
the predictable first mistake. This app's authorization lives in
`src/lib/access.ts`; nothing here should hold a credential that can bypass a
storage policy.

### Local parity

**MinIO as a service in `docker-compose.yml`** — which is the original 30 July
plan, restored, and it costs nothing now that development already runs Compose
for Postgres. Identical SDK, identical presigning, identical bucket semantics;
only env values differ between a laptop and the box. Bucket creation and the
public policy go in an init script so a fresh checkout gets both from
`docker compose up`.

The `supabase start` parity story is dead with the vendor, and it took a
question with it: whether the dev database should move to the local Supabase
Postgres. It should not; there is no Supabase.

## Route changes

Seven files touch upload storage. All must move together — a partial migration
leaves exports silently empty.

| File                                        | Current               | Change                                                                                                                             |
| ------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `documents/[id]/attachments/route.ts:58,64` | `mkdir` + `writeFile` | After `requireDocument(…, "own")`, return a presigned PUT + final URL. No bytes through Node.                                      |
| `documents/[id]/background/route.ts:54,60`  | `mkdir` + `writeFile` | Same, **plus a confirm step** — this route writes `background_image` to the DB, so the row updates only after the upload succeeds. |
| `attachments/[filename]/route.ts:110` (GET) | `readFile`            | Keep `requireAttachmentRead`, then 302 to a presigned GET.                                                                         |
| `attachments/[filename]/route.ts:168` (PUT) | `writeFile`           | In-place text edits stay server-side (`getObject`/`putObject`) — small, already parsed, not worth a round trip.                    |
| `attachments/access.ts:36`                  | `resolveWithin` path  | Becomes key derivation — but keeps `assertSafeFilename`, see below.                                                                |
| `import/route.ts:251-275`                   | `mkdir` + `writeFile` | Server already holds the zip bytes; swap to `putObject`.                                                                           |
| `export/route.ts:121,136`                   | `readFile`            | Swap to `getObject`.                                                                                                               |

Route wrappers (`userRoute` / `optionalUserRoute`) and the `src/lib/access.ts`
authorization helpers are unchanged — this proposal moves _where bytes live_,
not who may reach them.

## Security note: presigning moves validation

Once the app stops seeing the bytes, it can no longer inspect them. A naive
presigned URL accepts any content of any size. Mitigations, all three required:

1. **Bound it at the bucket, not in the signature.** The original plan said to
   set a content-length range and content-type condition in the presign policy.
   That is a **POST-policy** mechanism; a presigned *PUT* can only sign the
   `Content-Length` and `Content-Type` headers, which binds a well-behaved
   client and nothing else. A per-bucket size and MIME limit is enforced
   server-side regardless of what the client sends, so that is where the ceiling
   belongs — check the chosen vendor exposes one, since the spelling differs
   (Supabase called it `file_size_limit`/`allowed_mime_types`; MinIO and S3 want
   a bucket policy). Sign the headers as well — defence in depth, and it turns
   the common mistake into a clear error.
2. **Re-validate on confirm.** For backgrounds, the confirm step should `HEAD`
   the object and check size and content-type before writing `background_image`
   to the DB.
3. **Port the traversal check, do not drop it.** Keys for _writes_ are derived
   server-side, but the read path is not: `GET /api/attachments/[filename]`
   takes its filename from the URL. Today the boundary is a filesystem one —
   `assertSafeFilename` rejects `..` and separators, then
   `resolveWithin(ATTACHMENTS_DIR, filename)` proves the resolved path stayed
   inside the directory (`attachments/access.ts:24-36`). An object key space has
   no equivalent of "resolved outside the directory": `a/../../b` is just a key,
   so `resolveWithin` has nothing to assert and its half of the defence silently
   evaporates. `assertSafeFilename` must therefore become a **validating key
   constructor** — reject anything that is not a bare `attach_<uuid>_…` basename
   — rather than being deleted along with the path join it fed.

The existing extension sanitising (`/^\w{1,16}$/` on the extension,
`SAFE_ATTACHMENT_EXTENSIONS` mapping unknown types to `.bin`,
`resolveWithin`/`safeBasename` for zip entries) carries over to key
construction.

Note that the `bodySizeLimit: "2mb"` in `next.config.ts` applies to server
actions, not these route handlers. The platform request-body ceiling that used
to be the second argument for presigning (Vercel's 4.5MB) is gone with the
platform; what remains is that proxying bytes through Node holds a request slot
on a single small box, which is the §Constraints argument and is enough on its
own.

## Migration

`scripts/migrate-uploads-to-storage.ts`:

- Walks **both roots** — `BACKGROUNDS_DIR` → `blog-public` and `ATTACHMENTS_DIR`
  → `blog-private`. (An earlier draft walked only `public/uploads`, which
  predates the `UPLOADS_DIR` split and would have missed every attachment.)
- **Filenames become keys unchanged**, one bucket each, no prefix.
- Idempotent — skips objects that already exist.

At 19MB / 81 files this runs in seconds. Verify object count against file count,
then deploy the code that reads from the bucket.

**Source of truth: whichever copy is live when this runs.** The earlier "run it
before the first Vercel deploy, from the checkout that still has the files"
urgency is void — with volumes in place, the files live on the box, and this
checkout's copy becomes the stale one the moment production takes an upload.
Run the migration *from the box*, against the volumes.

### Attachments need no backfill; backgrounds do

These two are **not** symmetric, and an earlier draft claiming "no data
backfill" was wrong about the second:

- **Attachments** are reached through `/api/attachments/<filename>` — a route.
  It keeps its URL and changes only what it does internally, so the stored
  strings keep resolving untouched.
- **Backgrounds** are not. `background_image` stores an app-relative path
  (`/uploads/directories/<name>`, written at `background/route.ts:63`) that is
  rendered straight into HTML and served by Next off the static tree. **There is
  no route in front of it to repoint.** Deleting the local files without
  addressing this 404s all 70 images.

Pick one, and state it in the migration commit:

1. **Backfill the column** — rewrite `background_image` to the absolute
   `S3_PUBLIC_URL/<name>`. One `UPDATE` with a prefix replace; correct, but the
   bucket's public hostname is then baked into rows and moving it later needs
   another backfill.
2. **Keep the path, add a rewrite** — a `next.config.ts` rewrite from
   `/uploads/directories/:name` to the public bucket. No data change, and the
   hostname stays in env where it belongs.

Option 2 is preferred: it keeps the stored value a stable identifier rather than
a location, which is the same reason attachments do not need a backfill at all.
It also still beats the redirect an earlier draft proposed, which costs the
browser a second round trip per image — though the rewrite is now resolved by
Next on the box rather than at Vercel's edge, so it is a proxied hop rather than
a free one. If that ever matters, the same rewrite belongs in the Caddyfile
instead.

## What stays in Postgres — a scope boundary, not an omission

This plan moves **two** asset classes. Those are not where most of the app's
image bytes live, so the boundary is worth stating as a decision rather than
leaving it to read as an oversight.

**Editor images are not files.** Inserting an image runs `mediaFileReader` and
puts the resulting **data URI directly into the node's `src`**
(`ToolbarPlugin/Dialogs/ImageDialog.tsx:100-121`). Sketches do the same with an
inline SVG data URI (`nodes/SketchNode/index.tsx:188`), as do graphs. That
string is serialized into the Lexical state, stored as `Revision.data Json`
(`prisma/schema.prisma:135`) — so the bytes land in Postgres, base64-encoded at
~1.37×, **duplicated in full in every revision** of every document containing
them.

Only `AttachmentDialog.tsx:87,142` (`apiClient.documents.uploadAttachment`) ever
reaches the uploads directory. Paste, drag-drop and insert-image do not.

Left as-is deliberately, for now:

- The durability problem this plan exists to solve **does not apply** to editor
  images. They are in Postgres, which survives redeploy and is shared between
  instances. They are safe; they are merely expensive.
- Routing them through the same presigned-PUT path is a real option, and the
  storage layer built here is its prerequisite. But it changes the document
  format — a node's `src` stops being self-contained — with consequences for
  export bundles, fork, revision diffing and offline rendering. That is a
  content-model change, not a hosting change.

**Do not treat this plan as having solved image storage.** Revision-table growth
from embedded base64 stopped being a *billing* problem when Supabase's metered
database went away, but it is still a design problem and now a **backup** one:
every embedded image is re-dumped in full, in every revision, on every nightly
`pg_dump`. Measure it against the real database before deciding whether it needs
its own plan — the number that matters is now dump size, not vendor storage.

## Rollout

Two commits, each independently verifiable — **when the trigger fires**:

1. **Storage layer + local MinIO** — `src/lib/storage.ts`, the MinIO service and
   bucket-init script in `docker-compose.yml`, `.env.example`, dependencies.
   Verifiable locally before any route changes exist.
2. **Route migration + backfill** — the seven files above, plus the migration
   script and CLAUDE.md updates.

Two earlier endings, both now wrong, recorded so neither is re-derived: the
first draft said to delete `vercel.json` as "the last artifact of the serverless
path this work rules out"; the second said it **stays**. It is deleted — not by
this plan, but by `production-deployment.md` §3, for reasons that have nothing
to do with storage.

## Open questions

- **Signed URL expiry** for attachments is unset. A short window (5 min) limits
  leak damage; a longer one survives slow connections on large downloads.
- **Which store, when the trigger fires?** Deferred deliberately — see the
  header. Favour whichever already holds the offsite backups.
- **Does a public bucket beat Cloudflare in front of the origin?** Backgrounds
  are already CDN-cached off the static tree. The bucket's advantage is that it
  removes the box from the path entirely; whether that is worth a vendor is a
  question for the day the trigger fires, not before.

Closed since the first draft:

- ~~Thumbnails and OG images were not audited for filesystem writes.~~ Audited:
  `/api/thumbnails/[id]` renders on demand and `/api/og` runs on the edge
  runtime. Neither contains a `writeFile`, `mkdir` or `readFile`. Nothing to
  migrate.
- ~~Backup story for self-hosted MinIO.~~ Returned, and answered elsewhere:
  `production-deployment.md` §5 backs up the upload volumes offsite regardless
  of whether they are ever fronted by MinIO. The backup job does not care.
- ~~Supabase free-tier storage and egress ceilings.~~ Moot with the vendor.
