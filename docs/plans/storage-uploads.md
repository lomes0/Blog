# Storage Support: moving uploads off the filesystem

Status: **proposal**, not yet implemented. Decided 2026-07-30 during production
readiness work. Revised 2026-07-30 — re-checked against the tree after the
`UPLOADS_DIR` split landed; migration and security sections corrected, scope
boundary made explicit (§What stays in Postgres).

**Rewritten 2026-08-13: the hosting premise reversed.** The original plan
targeted a container on Fly with Cloudflare R2 for objects and MinIO for local
parity, and explicitly *rejected* Vercel. Production is now **Vercel +
Supabase**, so `fly.toml`, the `Dockerfile`, `.dockerignore` and
`docker-compose.prod.yml` are deleted and the object store is **Supabase
Storage**. What survives that reversal is most of this document — the security
analysis, the backgrounds backfill, the route inventory and the scope boundary
were never about the host. What changes is the vendor, the local-parity story,
and the plan's *status*: it is no longer an improvement.

**On Vercel this is a prerequisite, not an optimisation.** A serverless function
has no writable filesystem that outlives the request and no filesystem shared
between invocations. Every `mkdir` + `writeFile` in the seven routes below
either fails outright or writes to `/tmp` on one instance and is unreachable
from the next. The app cannot be deployed until this lands.

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
`<cwd>/public/uploads/directories` (`src/lib/uploads.ts`). Three consequences,
the third new:

1. **Redeploys destroy data.** A new deployment is a fresh filesystem. Every
   uploaded file is gone; the DB rows survive and still point at
   `/api/attachments/attach_xyz.png`. The result is a database full of URLs that
   404 — silent loss, discovered later by readers.
2. **Horizontal scale is impossible.** Two instances have separate filesystems.
   An upload lands on A; the next request routes to B, which has no such file.
3. **On Vercel there is no step 1 to begin with.** The bundle is read-only
   apart from `/tmp`, which is per-invocation. This is not a durability risk to
   be accepted for a while — it is a hard failure on the first upload.

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
  request slot for the full transfer. On Vercel this also burns function
  duration, which is metered.

## Decisions

| Axis                | Choice                                                                     |
| ------------------- | -------------------------------------------------------------------------- |
| Backend             | **Supabase Storage**, driven through its S3-compatible endpoint             |
| Client              | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, not `supabase-js`   |
| Local parity        | **`supabase start`** — the same Storage API on localhost, no second vendor  |
| Upload path         | **Presigned direct-to-bucket PUT** — the app signs, the browser transfers   |
| Serve path          | **Public backgrounds, signed attachments** — two buckets                    |
| Size/type ceiling   | **Bucket-level limits**, not presign conditions — see the security note      |

### Why the S3 endpoint rather than `supabase-js`

Supabase Storage speaks S3. Using the AWS SDK against it buys two things worth
more than the convenience of the native client:

- **The escape hatch stays open.** R2, S3 and MinIO are all the same code behind
  the same env vars. If Supabase is ever the wrong answer, the change is a
  `S3_ENDPOINT` and a migration script, not a rewrite. Having just reversed one
  hosting decision, this is not hypothetical.
- **One dependency, not two.** `supabase-js` would arrive carrying an auth
  client this app does not use — NextAuth owns sessions here, and a second
  identity library in the tree is a standing invitation to confusion.

The cost is that Supabase's native `createSignedUploadUrl` is not used, so the
one-token-per-upload ergonomics are traded for standard presigned PUTs. That is
the right trade at this size.

Rejected, with reasons:

- **Postgres `bytea`** — satisfies local parity perfectly, but every byte then
  flows through Node _and_ the database connection. Fails the performance
  constraint, and bloats backups.
- **Vercel Blob** — genuinely fine, and now that the platform is chosen it is no
  longer disqualified by association. Rejected because it splits durable state
  across two vendors when Supabase is already holding the database, and because
  it has no local emulator, which fails the parity constraint outright.
- **Cloudflare R2 + MinIO** (the original plan) — still technically sound and
  cheaper at egress. Rejected because it adds a third vendor and a compose
  service to run locally, both of which Supabase already provides. Keep it in
  mind if egress ever becomes a real line item.
- **Everything public** — fastest and simplest, but drops the existing access
  control on attachments. A security regression, not a tradeoff.

### Why two buckets

Supabase grants public access per _bucket_, not per prefix, and the two asset
classes already have different access rules today. **The split exists in the
code already** — `src/lib/uploads.ts` separates them onto two roots precisely
because one is authorization-gated and the other is not.

Buckets also carry `file_size_limit` and `allowed_mime_types` per bucket, which
is where the upload ceiling belongs (see the security note).

### The caching tradeoff

Signed URLs are unique per issue, which defeats CDN caching. That is acceptable
for attachments (accessed rarely, must stay gated) and unacceptable for
backgrounds (rendered on every page view). Splitting by bucket is what lets each
class get the right treatment rather than a single compromise. Public Supabase
objects are served through its CDN, so backgrounds cache without the app in the
path at all.

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
S3_ENDPOINT=https://<ref>.supabase.co/storage/v1/s3   # http://127.0.0.1:54321/storage/v1/s3 locally
S3_REGION=<project region>                            # Supabase requires the real region, not "auto"
S3_ACCESS_KEY_ID=                                     # Storage → S3 access keys, not the anon/service JWT
S3_SECRET_ACCESS_KEY=
S3_BUCKET_PUBLIC=blog-public
S3_BUCKET_PRIVATE=blog-private
S3_PUBLIC_URL=https://<ref>.supabase.co/storage/v1/object/public/blog-public
S3_FORCE_PATH_STYLE=true                              # Supabase's endpoint is path-style
```

`S3_PUBLIC_URL` is separate from `S3_ENDPOINT` because the public read path is
not the S3 path — Supabase serves public objects from
`/storage/v1/object/public/<bucket>/<key>` through its CDN, while the S3
endpoint is for signed operations.

**The S3 access key is not the service-role JWT.** They are separate
credentials issued from separate screens, and reaching for the JWT here is the
predictable first mistake. The service-role key belongs nowhere in this app at
all — it bypasses every Supabase policy and this app's authorization lives in
`src/lib/access.ts`, not in RLS.

### Local parity

`supabase start` runs the whole stack locally in Docker, Storage included, at
`127.0.0.1:54321`. Identical SDK, identical presigning, identical bucket
semantics — only env values differ between a laptop and production. Bucket
creation and the public policy go in a `supabase/migrations/` SQL file so a
fresh checkout gets both by running the same command.

This supersedes the MinIO-in-compose plan and, separately, raises the question
of whether `docker-compose.yml` (a bare `postgres:16` for dev) should be
replaced by the local Supabase Postgres. **Not decided here** — the dev database
holds real content and swapping it is its own small migration. Note that
`supabase start` binds Postgres on **54322**, so the two can coexist while that
is decided.

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
   client and nothing else. Supabase's per-bucket `file_size_limit` and
   `allowed_mime_types` are enforced server-side regardless of what the client
   sends, so that is where the ceiling belongs. Sign the headers as well —
   defence in depth, and it turns the common mistake into a clear error.
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
actions, not these route handlers. Vercel's own 4.5MB request-body ceiling on
functions applies to neither once uploads go direct to the bucket — which is a
second, independent reason presigning is the right shape here rather than
proxying bytes.

## Migration

`scripts/migrate-uploads-to-storage.ts`:

- Walks **both roots** — `BACKGROUNDS_DIR` → `blog-public` and `ATTACHMENTS_DIR`
  → `blog-private`. (An earlier draft walked only `public/uploads`, which
  predates the `UPLOADS_DIR` split and would have missed every attachment.)
- **Filenames become keys unchanged**, one bucket each, no prefix.
- Idempotent — skips objects that already exist.

At 19MB / 81 files this runs in seconds. Verify object count against file count,
then deploy the code that reads from the bucket.

**Run it before the first Vercel deploy, from the checkout that still has the
files.** They exist only on this machine; there is no deployed instance holding
a second copy.

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
It is also cheaper on Vercel than the redirect an earlier draft proposed — a
`rewrite` is resolved at the edge, where a `redirect` costs the browser a second
round trip per image.

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
from embedded base64 is now a *billing* problem as well as a design one —
Supabase meters database size where a self-hosted volume did not. Measure it
against the real database before deciding whether it needs its own plan.

## Rollout

Two commits, each independently verifiable:

1. **Storage layer + Supabase wiring** — `src/lib/storage.ts`, the bucket
   migration SQL, `.env.example`, dependencies. Verifiable locally against
   `supabase start` before any route changes exist.
2. **Route migration + backfill** — the seven files above, plus the migration
   script and CLAUDE.md updates.

`vercel.json` **stays** — an earlier draft ended by telling you to delete it as
"the last artifact of the serverless path this work rules out". That sentence is
now exactly backwards.

## Open questions

- **Signed URL expiry** for attachments is unset. A short window (5 min) limits
  leak damage; a longer one survives slow connections on large downloads.
- **Does the dev database move to the local Supabase Postgres?** See §Local
  parity. Coexistence works today (54322 vs 5432), so this can wait.
- **Free-tier ceilings.** Supabase's free tier caps storage and egress. 19MB is
  nothing, but backgrounds are served on every page view and egress is the
  metered axis, not size. Worth a number before launch rather than after.

Closed since the first draft:

- ~~Thumbnails and OG images were not audited for filesystem writes.~~ Audited:
  `/api/thumbnails/[id]` renders on demand and `/api/og` runs on the edge
  runtime. Neither contains a `writeFile`, `mkdir` or `readFile`. Nothing to
  migrate.
- ~~Backup story for self-hosted MinIO.~~ Moot: Supabase replicates and backs up
  its own storage. If the R2 path is ever revisited, this question returns with
  it.
