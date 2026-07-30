# Storage Support: moving uploads off the container filesystem

Status: **proposal**, not yet implemented. Decided 2026-07-30 during production
readiness work.

## Problem

Uploaded files are written to the container's own filesystem, while only a path
string is persisted to Postgres. The two have different lifetimes, and neither
is shared between machines.

```ts
// src/app/api/documents/[id]/attachments/route.ts:50
const uploadDir = path.join(process.cwd(), "public/uploads/attachments");
await mkdir(uploadDir, { recursive: true });
await writeFile(filePath, buffer); // bytes → this container
const fileUrl = `/api/attachments/${fileName}`; // string → the database
```

`process.cwd()` is `/app` inside the image. Two consequences:

1. **Redeploys destroy data.** `fly deploy` builds a fresh image and discards
   the old one. Every uploaded file is gone; the DB rows survive and still point
   at `/api/attachments/attach_xyz.png`. The result is a database full of URLs
   that 404 — silent loss, discovered later by readers.
2. **Horizontal scale is impossible.** `fly scale count 2` produces two
   containers with separate filesystems. An upload lands on machine A; the next
   request round-robins to machine B, which has no such file. This must be fixed
   _before_ scaling out, not after.

There are currently **19MB across 80 files** in `public/uploads`.

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
already have different access rules today:

- **Backgrounds** are written to `public/uploads/directories/` and referenced as
  `/uploads/directories/…`, served as plain Next.js static assets. **Already
  unauthenticated.** Making them public-bucket URLs changes nothing about who
  can read them, and buys full CDN cacheability.
- **Attachments** are gated: `GET /api/attachments/[filename]` calls
  `requireAttachmentRead(filename, user)` before serving. That check must
  survive.

So: `blog-public` (backgrounds) and `blog-private` (attachments).

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
| `documents/[id]/attachments/route.ts:50-57` | `mkdir` + `writeFile` | After `requireDocument(…, "own")`, return a presigned PUT + final URL. No bytes through Node.                                      |
| `documents/[id]/background/route.ts:51-60`  | `mkdir` + `writeFile` | Same, **plus a confirm step** — this route writes `background_image` to the DB, so the row updates only after the upload succeeds. |
| `attachments/[filename]/route.ts:110` (GET) | `readFile`            | Keep `requireAttachmentRead`, then 302 to a presigned GET.                                                                         |
| `attachments/[filename]/route.ts:168` (PUT) | `writeFile`           | In-place text edits stay server-side (`getObject`/`putObject`) — small, already parsed, not worth a round trip.                    |
| `attachments/access.ts:26`                  | `process.cwd()` path  | Becomes key derivation, not a filesystem path.                                                                                     |
| `import/route.ts:253-277`                   | `mkdir` + `writeFile` | Server already holds the zip bytes; swap to `putObject`.                                                                           |
| `export/route.ts:125,140`                   | `readFile`            | Swap to `getObject`.                                                                                                               |

Route wrappers (`userRoute` / `optionalUserRoute`) and the `src/lib/access.ts`
authorization helpers are unchanged — this proposal moves _where bytes live_,
not who may reach them.

## Security note: presigning moves validation

Once the app stops seeing the bytes, it can no longer inspect them. A naive
presigned URL accepts any content of any size. Mitigations, both required:

1. **Bound the signature.** Set a content-length range and content-type
   condition in the presign policy, so an oversized or wrong-typed PUT is
   rejected by the bucket itself.
2. **Re-validate on confirm.** For backgrounds, the confirm step should `HEAD`
   the object and check size and content-type before writing `background_image`
   to the DB.

The existing extension sanitising (`/^\w{1,16}$/` on the extension,
`resolveWithin`/`safeBasename` for zip entries) carries over to key construction
— keys are still derived server-side, never client-supplied.

Note that the `bodySizeLimit: "2mb"` in `next.config.ts` applies to server
actions, not these route handlers; presigned uploads bypass request-size
ceilings entirely regardless.

## Migration

`scripts/migrate-uploads-to-s3.ts`:

- Walks `public/uploads`, routing `directories/` → `blog-public` and
  `attachments/` → `blog-private`.
- **Filenames become keys unchanged**, so every existing DB path
  (`/uploads/directories/dir_….png`, `/api/attachments/attach_….png`) keeps
  resolving with no data backfill.
- Idempotent — skips objects that already exist.

At 19MB / 80 files this runs in seconds. Verify object count against file count,
then deploy the code that reads from the bucket.

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

- **Thumbnails** (`/api/thumbnails/*`) and OG images (`/api/og`) were not
  audited for filesystem writes. Worth a pass before implementation.
- **Backup story for self-hosted MinIO** — cloud R2 is replicated by the vendor;
  a self-hosted MinIO volume is not. Self-hosters need a documented backup path.
- **Signed URL expiry** for attachments is unset. A short window (5 min) limits
  leak damage; a longer one survives slow connections on large downloads.
