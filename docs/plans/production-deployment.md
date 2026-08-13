# Production deployment: a single VPS running Docker Compose

Status: **decided**, not yet implemented. Decided 2026-08-13, superseding the
Vercel + Supabase decision taken the same morning (`e9018f00`) and the Fly + R2
decision of 2026-07-30 before it.

This is the third hosting decision in two weeks. The other two are recorded
because their reasoning is still worth reading, not because they are live.

## Why this one

The app acquired three features in August that all assume a process which
outlives a request:

| Feature | Shipped | Needs |
| --- | --- | --- |
| `pg_notify` → `LISTEN` → SSE change feed | 8 Aug | a connection held open indefinitely |
| `/api/events` | 8 Aug | a response held open indefinitely |
| `/api/mcp` token-bucket limiter (`src/lib/mcp/limits.ts`) | 8 Aug | one process, or shared state |

On serverless, all three are broken or rewritten. The Vercel decision recorded
them as consequences; read together, they were the decision. A persistent
container makes all three correct as built, with no code change.

Two secondary facts settled it:

- **The deployment is commercial, or may become so.** That removes Vercel Hobby
  (its licence forbids commercial use) and Supabase Free (which pauses an idle
  project). Comparing paid tiers against a €5 box changes the arithmetic.
- **Headless Chrome is gone.** There is no `/api/pdf` route and no `puppeteer`
  dependency in the tree — CLAUDE.md still lists both, and both are stale. The
  single worst fit for serverless was not actually a constraint, but neither is
  it a cost of self-hosting: nothing here needs a browser.

What this costs is ops, and it is worth naming rather than discovering: TLS
renewal, backups, restore drills, upgrades and alerting are now yours. §5 is
that bill.

## 1. Topology

One box. Three services on a private Compose network, one of them published.

```
            ┌─────────────── VPS ────────────────┐
 Internet ─→│ caddy :80/:443  (TLS, reverse proxy)│
 (via CF)   │      ↓                              │
            │ app :3000       (Next standalone)   │
            │      ↓                              │
            │ postgres :5432  (not published)     │
            └─────────────────────────────────────┘
              volumes: pgdata · attachments · backgrounds
```

`caddy` is the addition to the recovered `docker-compose.prod.yml`, which
published the app on `:3000` with no TLS. Caddy obtains and renews Let's
Encrypt certificates with no configuration beyond the hostname, which is the
whole reason to prefer it to nginx here.

Postgres stays unpublished — reachable only over the Compose network. Note this
differs from the dev `docker-compose.yml`, which publishes `5432` deliberately.

### 1.1 Cloudflare in front

Recommended, free, and it earns its place three times: it terminates TLS at the
edge, it caches `/_next/static/*` so VPS bandwidth stops being the scaling
limit, and it hides the origin IP behind a proxy that absorbs traffic the box
could not.

**One caveat that will otherwise cost an afternoon:** `/api/events` is an SSE
stream, and a proxy that buffers it produces the exact failure
`changes_detection.md` §5 describes — the connection opens, the browser fires
`open`, and nothing ever arrives. The route already sends `X-Accel-Buffering:
no` and `Cache-Control: no-cache, no-transform`, which is what Cloudflare reads.
Verify the stream end to end through the proxy before believing it works; the
failure is silent.

## 2. Uploads stay on the filesystem

**`docs/plans/storage-uploads.md` is deferred, not a blocker.** This is the
largest consequence of the topology and the one most likely to be got wrong by
inheriting the previous plan's urgency.

That plan opened with two failures. On a single box with named volumes, both are
already answered:

1. *"Redeploys destroy data."* A named volume outlives `docker compose up
   --build`. The container is replaced; the volume is not.
2. *"Horizontal scale is impossible."* There is one instance. Two instances is
   the trigger to revisit, not a present condition.

The third failure it added — *"on Vercel there is no writable filesystem to
begin with"* — does not apply here at all. So the work that was a hard
prerequisite this morning is back to being the improvement it was on 30 July,
and the deploy is no longer blocked on it. 19MB of data does not justify seven
route rewrites, a presigning flow and a migration script.

**What must be fixed regardless — and it is a live bug in the recovered
compose.** `src/lib/uploads.ts` puts the two asset classes on different roots:

- `ATTACHMENTS_DIR` → `$UPLOADS_DIR` or `<cwd>/var/uploads/attachments`
- `BACKGROUNDS_DIR` → `<cwd>/public/uploads/directories`, hardcoded, inside the
  static tree on purpose (§ that file's docblock)

The deleted `docker-compose.prod.yml` mounted `blog-uploads:/app/var/uploads`
and nothing else. Backgrounds — **19MB across 70 files, against 180KB across 11
for attachments, so nearly all of the data** — sat in the image's writable layer
and would have been destroyed by every rebuild. The restored compose needs a
second volume at `/app/public/uploads/directories`, and the Dockerfile needs to
`mkdir`+`chown` it for the same reason it already does for `./var` (a volume
mounted over a path the runtime user does not own arrives root-owned, and every
upload fails `EACCES`).

**When to revisit:** a second app instance, a move to a CDN origin, or uploads
past a few GB — whichever comes first. `storage-uploads.md`'s S3-SDK-not-vendor-
SDK choice means the target is still open (R2, S3, MinIO, Supabase) whenever
that day arrives.

**What this does cost:** durability is now entirely your backup job, where an
object store would have provided it. §5 is not optional.

## 3. Restoring what was deleted

`e9018f00` deleted four files and one config line. Three come back close to
verbatim — `git show e9018f00^:<path>` recovers them, and the Dockerfile in
particular is good work worth keeping.

| Artifact | Action |
| --- | --- |
| `Dockerfile` | Restore. Add the backgrounds `mkdir`/`chown` (§2) |
| `docker-compose.prod.yml` | Restore. Add `caddy`, add the backgrounds volume, drop the published `3000:3000` in favour of proxying |
| `.dockerignore` | Restore verbatim |
| `output: "standalone"` in `next.config.ts` | Restore. The comment at L150 explaining its removal goes with it |
| `fly.toml` | **Do not restore.** Fly is not the target; its `release_command` was the only reason migrations were not applied on boot |
| `vercel.json` | Delete |
| `IS_VERCEL` (`next.config.ts:13`, used at L199) | Review — it keys off `NEXT_PUBLIC_VERCEL_URL`, which will now never be set. Decide whether the guarded branch should be on or off here rather than leaving it dead |

Also worth reconciling: `.nvmrc` says 24 and the Dockerfile builds on
`node:24-alpine`, but local development is on v22.23.1. The image is the
authority for production; the drift is a dev-side annoyance, not a deploy risk.

## 4. Build and deploy

**Build off-box, in CI, and have the box pull an image.** `node_modules` is
1.6GB and the build compiles Excalidraw, MathLive and GeoGebra; that wants more
RAM than a cheap VPS should be sized to spend, and building on the box means the
site is degraded for the duration of every deploy.

```
GitHub Actions ──build──→ GHCR ──pull──→ VPS: docker compose up -d
```

The alternative — `docker compose -f docker-compose.prod.yml up --build` over
ssh — needs no CI setup and is a reasonable place to start. It requires sizing
the box for the build rather than the runtime (§6) and accepting build-time
degradation. Start there if CI is a yak; move to GHCR when the build annoys you.

### 4.1 The build must not need a database

Found by actually building the image, and it is a constraint worth defending
rather than a one-off fix. `src/app/sitemap.ts` queries Postgres, and Next
prerenders it by default, so `docker build` failed with
`Environment variable not found: DATABASE_URL` — the *only* prerendered route in
the app that touches the database.

It is now `dynamic = "force-dynamic"`. Passing a build-time `DATABASE_URL`
would have "fixed" it while baking the post list as it stood at build time, so
every post published afterwards would be invisible to crawlers until the next
redeploy — served, well-formed, and silently stale.

Keeping the image buildable without a database is what lets it be built in CI
(§4), on a laptop, or anywhere, and promoted between environments as one
artifact. If another prerendered route ever grows a query, this is the failure
it will produce.

**Verified 13 Aug 2026:** image builds clean (573MB), the standalone server
boots, `/api/health` returns its documented 503 + `db: down` against an
unreachable database, static chunks and `/offline` serve 200, and both upload
directories exist owned by `nextjs:nodejs` so a volume mount will not `EACCES`.

**Migrations** run on boot, as the recovered compose already does
(`npx prisma migrate deploy && node server.js`). That is safe precisely because
there is one instance — the multi-instance race that justifies a separate
release step does not exist here.

## 5. Backups — the actual price of this decision

Nothing else in this document can fail as expensively. Both durable stores live
on one disk, and §2 chose to keep them there.

**Two layers, because they fail differently:**

1. **Provider snapshots** (Hetzner et al. offer these for ~20% of server cost).
   Whole-box, trivial to enable, and the right tool for "the disk died."
   Insufficient alone: a corrupted database gets faithfully snapshotted, and
   restoring is all-or-nothing.
2. **Nightly logical backup, offsite.** `pg_dump` plus the two upload volumes,
   pushed to an object store on a *different provider* — Backblaze B2 or
   Cloudflare R2, both cents-per-month at this size, R2 with no egress charge on
   restore. This is what survives corruption, a bad migration, and the VPS
   account itself going away.

**Restore must be rehearsed, on a schedule, or it is not a backup.** Restore
last night's dump into a throwaway Postgres and boot the app against it. The
common ending to this story is discovering the cron job broke in March.

Retention: 7 daily, 4 weekly, 6 monthly is a fine default and costs almost
nothing at this volume.

## 6. Sizing and cost

| | Spec | ~€/mo |
| --- | --- | --- |
| VPS, pulling prebuilt images | 2 vCPU / 4GB (Hetzner CX22-class) | 4–5 |
| VPS, building on-box | 4 vCPU / 8GB (CX32-class) | 8–9 |
| Provider snapshots | +20% of server | 1–2 |
| Offsite backup (B2/R2) | a few GB | <1 |
| Cloudflare | free tier | 0 |

**Roughly €6–12/mo all in**, against Vercel Pro at $20 plus Supabase Pro at $25
once the commercial answer removes the free tiers. Cost is not why to pick this,
but it is no longer close.

## 7. What now works that would not have

Confirming these, since they were the argument:

- **The change feed ports unchanged.** `CHANGES_DATABASE_URL` is left unset and
  falls back to `DATABASE_URL` — there is no transaction-mode pooler in this
  topology, so the silent-`LISTEN`-failure hazard does not arise.
  `changes_detection.md` §6 is rewritten for this target, and now says the live
  risk is the **proxy**, not the database (§6.2 there, §1.1 here).
- **`/api/events` holds its SSE response open** for as long as the client stays
  connected. No duration cap. Watch the proxy, not the platform (§1.1).
- **`src/lib/mcp/limits.ts` is correct as written.** One process, one set of
  buckets, limits that mean what they say.
- **`/api/og` at `runtime = "edge"`** runs under Next's Node-based emulation
  when self-hosted. It works; it is not as fast as it is on Vercel. At this
  traffic that is not a sentence anyone will notice.

## 8. Out of scope, but blocking a *commercial* launch

Named here so they are not mistaken for solved by choosing a host. From
`auth-prod-readiness`:

- **AI routes are unrated.** `/api/completion` and `/api/copilot` spend real
  money per request against `ANTHROPIC_API_KEY`. Registration is open — anyone
  completing an OAuth sign-in gets an account. The MCP limiter now works, but it
  does not cover these two routes.
- **Administration is psql-only.** No UI for disabling an account.
- **Middleware is a no-op.**

## 9. Order of work

1. ~~Restore `Dockerfile`, `.dockerignore`, `output: "standalone"`; delete
   `vercel.json`; resolve `IS_VERCEL` (§3)~~ — done, `118a5a8c`
2. ~~Restore `docker-compose.prod.yml` with `caddy` and **both** upload volumes
   (§2)~~ — done, `118a5a8c`. The backgrounds volume was the bug fix
3. ~~Re-status `storage-uploads.md` (§2) and rewrite `changes_detection.md`
   §6 (§7)~~ — done. Both stated a dead premise
4. ~~Build the image once, locally, to prove the Dockerfile~~ — done. It failed
   first time on §4.1 and passes now
5. Provision the box, point DNS, bring the stack up, confirm TLS
6. Migrate the existing 19MB of uploads onto the volumes
7. **Backups and a rehearsed restore (§5)** — before this is load-bearing, not
   after
8. External uptime check against `/api/health`, alerting somewhere you read
9. Verify the change feed end to end *through* Cloudflare (§1.1, and
   `changes_detection.md` §6.2 — the failure is silent, so this is a real step
   rather than a formality)
