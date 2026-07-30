# Storage Support: moving uploads off the container filesystem

Status: **proposal**, not yet implemented. Decided 2026-07-30 during production
readiness work. Revised 2026-07-30 — re-checked against the tree after the
`UPLOADS_DIR` split landed; migration and security sections corrected, scope
boundary made explicit (§What stays in Postgres).

## Problem

Uploaded files are written to the container's own filesystem, while only a path
string is persisted to Postgres. The two have different lifetimes, and neither
is shared between machines.

```ts
// src/app/api/documents/[id]/attachments/route.ts:58
await mkdir(ATTACHMENTS_DIR, { recursive: true });
await writeFile(filePath, buffer); // bytes → this container
const fileUrl = `/api/attachments/${fileName}`; // string → the database
```

Both roots resolve under `process.cwd()`, which is `/app` inside the image —
`ATTACHMENTS_DIR` defaults to `<cwd>/var/uploads/attachments` and
`BACKGROUNDS_DIR` is `<cwd>/public/uploads/directories` (`src/lib/uploads.ts`).
Two consequences:

1. **Redeploys destroy data.** `fly deploy` builds a fresh image and discards
   the old one. Every uploaded file is gone; the DB rows survive and still point
   at `/api/attachments/attach_xyz.png`. The result is a database full of URLs
   that 404 — silent loss, discovered later by readers.
2. **Horizontal scale is impossible.** `fly scale count 2` produces two
   containers with separate filesystems. An upload lands on machine A; the next
   request round-robins to machine B, which has no such file. This must be fixed
   _before_ scaling out, not after.

Currently on disk: **19MB across 70 files** in `public/uploads/directories`
(backgrounds) and **180KB across 11 files** in `var/uploads/attachments`. The
volume is almost entirely backgrounds; the durability risk is spread across
both.

## Constraints

Two standing requirements drove every choice below.

- **Local hosting must be configuration-identical to prod.** No
  filesystem-in-dev / S3-in-prod adapter split — that is precisely the drift
  worth avoiding, because the code path that runs locally would not be the one
  that runs in production.
- **The app must not lag waiting on data.** Bytes must not stream through Node.
  Today every upload does `Buffer.from(await file.arrayBuffer())` (whole file in
  app memory) and every download does `readFile` then serves it — both occupy a
  request slot for the full transfer.

## Decisions

| Axis                | Choice                                                                    |
| ------------------- | ------------------------------------------------------------------------- |
| Backend             | S3-compatible object storage                                              |
| Cloud provider      | **Cloudflare R2** — zero egress, ~$0.015/GB/mo, host-independent          |
| Local + self-hosted | **MinIO** as a docker-compose service                                     |
| Upload path         | **Presigned direct-to-bucket PUT** — the app signs, the browser transfers |
| Serve path          | **Public backgrounds, signed attachments**                                |

Rejected, with reasons:

- **Postgres `bytea`** — satisfies local parity perfectly, but every byte then
  flows through Node _and_ the database connection. Fails the performance
  constraint, and bloats backups.
- **Fly Volumes** — fixes durability but a volume attaches to a single machine,
  so it does not fix horizontal scale.
- **Everything public** — fastest and simplest, but drops the existing access
  control on attachments. A security regression, not a tradeoff.
- **Vercel Blob** — ties storage to a platform ruled out for other reasons (no
  filesystem writes at all, and Prisma there needs a connection pooler).

### Why two buckets

R2 grants public access per _bucket_, not per prefix, and the two asset classes
already have different access rules today. **The split exists in the code
already** — `src/lib/uploads.ts` separates them onto two roots precisely because
one is authorization-gated and the other is not, and its header comment records
why (attachments under `public/` were readable with no session at all, filename
as the only secret):

- **Backgrounds** → `BACKGROUNDS_DIR` (`public/uploads/directories/`),
  referenced as `/uploads/directories/…` and served as plain Next.js static
  assets. **Already unauthenticated.** Making them public-bucket URLs changes
  nothing about who can read them, and buys full CDN cacheability.
- **Attachments** → `ATTACHMENTS_DIR` (outside the static tree), gated:
  `GET /api/attachments/[filename]` calls `requireAttachmentRead` before serving.
  That check must survive.

So: `blog-public` (backgrounds) and `blog-private` (attachments) — a 1:1 mapping
onto the two constants that already exist. `src/lib/uploads.ts` is the seam this
work swaps, which is why the route table below is short.

One cleanup first: `documents/[id]/background/route.ts:52` re-derives
`public/uploads/directories` by hand instead of importing `BACKGROUNDS_DIR`.
Make it import the constant, and the seam is total — after that, no route names
a storage location.

### The caching tradeoff

Signed URLs are unique per issue, which defeats CDN caching. That is acceptable
for attachments (accessed rarely, must stay gated) and unacceptable for
backgrounds (rendered on every page view). Splitting by bucket is what lets each
class get the right treatment rather than a single compromise.

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
S3_ENDPOINT=http://minio:9000        # R2 endpoint in cloud
S3_REGION=auto
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET_PUBLIC=blog-public
S3_BUCKET_PRIVATE=blog-private
S3_PUBLIC_URL=http://localhost:9000/blog-public   # R2 public/custom domain in cloud
S3_FORCE_PATH_STYLE=true             # required by MinIO, unset for R2
```

`S3_PUBLIC_URL` is separate from `S3_ENDPOINT` because the browser and the
server reach MinIO by different hostnames in compose (`localhost` vs `minio`).

### Local parity

MinIO joins `docker-compose.yml` and `docker-compose.prod.yml`, with a
short-lived init container that creates both buckets and applies the public
policy to `blog-public`. Identical SDK, identical presigning, identical bucket
semantics — only env values differ between a laptop, a self-hosted box, and Fly.

This also keeps **fully self-hosted deployment viable with no external SaaS
dependency**, which the R2-only path would have removed.

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

1. **Bound the signature.** Set a content-length range and content-type
   condition in the presign policy, so an oversized or wrong-typed PUT is
   rejected by the bucket itself.
2. **Re-validate on confirm.** For backgrounds, the confirm step should `HEAD`
   the object and check size and content-type before writing `background_image`
   to the DB.
3. **Port the traversal check, do not drop it.** Keys for _writes_ are derived
   server-side, but the read path is not: `GET /api/attachments/[filename]`
   takes its filename from the URL. Today the boundary is a filesystem one —
   `assertSafeFilename` rejects `..` and separators, then
   `resolveWithin(ATTACHMENTS_DIR, filename)` proves the resolved path stayed
   inside the directory (`attachments/access.ts:24-36`). An S3 key space has no
   equivalent of "resolved outside the directory": `a/../../b` is just a key, so
   `resolveWithin` has nothing to assert and its half of the defence silently
   evaporates. `assertSafeFilename` must therefore become a **validating key
   constructor** — reject anything that is not a bare `attach_<uuid>_…` basename
   — rather than being deleted along with the path join it fed.

The existing extension sanitising (`/^\w{1,16}$/` on the extension,
`SAFE_ATTACHMENT_EXTENSIONS` mapping unknown types to `.bin`,
`resolveWithin`/`safeBasename` for zip entries) carries over to key
construction.

Note that the `bodySizeLimit: "2mb"` in `next.config.ts` applies to server
actions, not these route handlers; presigned uploads bypass request-size
ceilings entirely regardless.

## Migration

`scripts/migrate-uploads-to-s3.ts`:

- Walks **both roots** — `BACKGROUNDS_DIR` → `blog-public` and `ATTACHMENTS_DIR`
  → `blog-private`. (An earlier draft walked only `public/uploads`, which
  predates the `UPLOADS_DIR` split and would have missed every attachment.)
- **Filenames become keys unchanged**, one bucket each, no prefix.
- Idempotent — skips objects that already exist.

At 19MB / 81 files this runs in seconds. Verify object count against file count,
then deploy the code that reads from the bucket.

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
2. **Keep the path, add a rewrite** — a `next.config.ts` redirect from
   `/uploads/directories/:name` to the public bucket. No data change, and the
   hostname stays in env where it belongs. Costs one redirect hop per image,
   cached by the CDN.

Option 2 is preferred: it keeps the stored value a stable identifier rather than
a location, which is the same reason attachments do not need a backfill at all.

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
  machines. They are safe; they are merely expensive.
- Routing them through the same presigned-PUT path is a real option, and the
  storage layer built here is its prerequisite. But it changes the document
  format — a node's `src` stops being self-contained — with consequences for
  export bundles, fork, revision diffing and offline rendering. That is a
  content-model change, not a hosting change.

**Do not treat this plan as having solved image storage.** Revision-table growth
from embedded base64 is a separate, live problem; measure it against the real
database before deciding whether it needs its own plan.

## Rollout

Two commits, each independently verifiable:

1. **Storage layer + MinIO wiring** — `src/lib/storage.ts`, compose services,
   `.env.example`, dependencies. Verifiable locally with `docker compose up`
   before any route changes exist.
2. **Route migration + backfill** — the seven files above, plus the migration
   script and CLAUDE.md updates.

Delete `vercel.json` alongside these — it is the last artifact of the serverless
path this work rules out.

## Open questions

- **Backup story for self-hosted MinIO** — cloud R2 is replicated by the vendor;
  a self-hosted MinIO volume is not. Self-hosters need a documented backup path.
- **Signed URL expiry** for attachments is unset. A short window (5 min) limits
  leak damage; a longer one survives slow connections on large downloads.

Closed since the first draft:

- ~~Thumbnails and OG images were not audited for filesystem writes.~~ Audited:
  `/api/thumbnails/[id]` renders on demand and `/api/og` runs on the edge
  runtime. Neither contains a `writeFile`, `mkdir` or `readFile`. Nothing to
  migrate.
