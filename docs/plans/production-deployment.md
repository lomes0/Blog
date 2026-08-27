# Production deployment: a single VPS running Docker Compose

Status: **decided**, not yet implemented. Decided 2026-08-13, superseding the
Vercel + Supabase decision taken the same morning (`e9018f00`) and the Fly + R2
decision of 2026-07-30 before it.

This is the third hosting decision in two weeks. The other two are recorded
because their reasoning is still worth reading, not because they are live.

**Read §2's update notes before acting on §2, §3 or §5.** Two of them are
corrections written after the fact, and the 27 Aug one subtracts a volume: the
background-image data this document treats as "nearly all of the data" was a
removed feature's orphans, and is deleted. There is one upload volume now,
holding ~180KB.

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
              volumes: pgdata · attachments
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
`changes-detection.md` §5 describes — the connection opens, the browser fires
`open`, and nothing ever arrives. The route already sends `X-Accel-Buffering:
no` and `Cache-Control: no-cache, no-transform`, which is what Cloudflare reads.
Verify the stream end to end through the proxy before believing it works; the
failure is silent.

## 2. Uploads stay on the filesystem — for now

> **Superseded in direction, 13 Aug 2026 (later the same day), by
> [blob-storage.md](./blob-storage.md).** Measuring the database showed the
> largest store of bytes was never the filesystem at all: six distinct images
> held 141 times inside `Revision.data`, one of them a third of the database.
> The decision is now one content-addressed blob store on R2, covering
> attachments, backgrounds *and* editor images.
>
> **This section still describes what to deploy today.** The volumes below are
> correct and stay mounted until that plan's phase 3 verification passes — they
> are what keeps the current data alive in the meantime. What changes is the
> destination, not the next step.
>
> **Update, 15 Aug 2026: phase 3 has passed, and the volumes stay anyway.** The
> migration moved *editor images* — the class that was never on the filesystem
> to begin with — out of `Revision.data` and into the store. `blob-storage.md`
> §10 step 5, attachments and backgrounds, was deliberately not done: neither
> duplicates, so neither contributed to the growth that plan existed to stop.
> So both volumes still hold every byte they held before, and unmounting either
> on the strength of "phase 3 is done" would delete live data. §2 below is
> current, in full.
>
> What *did* change for this deployment is the opposite of a simplification, and
> §2.1 is new because of it.
>
> **Update, 27 Aug 2026: there is one volume now, and §2 below is no longer
> current where it counts.** `blob-storage.md` §10.2 finally asked what step 5
> was protecting and found that half of it was nothing: the background-image
> feature had already been removed — the upload route threw unconditionally,
> nothing rendered the column — and its 19MB were orphans of the deleted
> directories feature. They are deleted, and the `blog-backgrounds` volume with
> them. **Every sentence below calling backgrounds "nearly all of the data" is
> arithmetic about bytes nothing reads.** What remains on disk is ~180KB of
> attachments, which stay for the reason §10.2 gives — the blocker is
> `PUT /api/attachments/[filename]`, which edits in place, and content
> addressing cannot express that. §2's *conclusion* survives all of this
> unchanged, and by a wider margin than it claimed.

**Object storage is not a blocker for this deployment.** That was the reasoning
when [archive/storage-uploads.md](./archive/storage-uploads.md) was merely
deferred, and it still holds for *what to deploy today* even though the
destination has since changed (see the note above). It is the largest
consequence of the topology and the one most likely to be got wrong by
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

**What must be fixed regardless — and it was a live bug in the recovered
compose. Resolved twice over, and the second time deleted the problem rather
than fixing it.** `src/lib/uploads.ts` *used* to put two asset classes on
different roots:

- `ATTACHMENTS_DIR` → `$UPLOADS_DIR` or `<cwd>/var/uploads/attachments`
- ~~`BACKGROUNDS_DIR` → `<cwd>/public/uploads/directories`~~ — gone, 27 Aug 2026

The deleted `docker-compose.prod.yml` mounted `blog-uploads:/app/var/uploads`
and nothing else. Backgrounds — 19MB across 70 files, against 180KB across 11
for attachments — sat in the image's writable layer and would have been
destroyed by every rebuild, so `118a5a8c` added a second volume at
`/app/public/uploads/directories` and the matching `mkdir`+`chown` in the
Dockerfile (a volume mounted over a path the runtime user does not own arrives
root-owned, and every upload fails `EACCES`).

**That was the right fix on the information available, and the information was
wrong.** Those 19MB were unreachable: no route could write them, no component
rendered them, and the files were `dir_<uuid>_*` orphans of a feature deleted
long before. "Do not silently destroy 19MB on every rebuild" beats "investigate
first" every time — but the investigation, when it finally happened, ended in a
`find … -delete` rather than a volume. Both the volume and the second
`mkdir`/`chown` are now gone. `ATTACHMENTS_DIR` is the only root, and the reason
it sits outside `public/` is unchanged and now unconditional.

The general lesson outlasts the 19MB: **a volume added to stop data loss is a
bet that the data is live, and that bet is cheap to make and expensive to leave
unexamined.** This one sat in the backup set, the topology diagram, the
Dockerfile and this document for two weeks.

**When to revisit:** a second app instance, a move to a CDN origin, or uploads
past a few GB — whichever comes first. That day arrived the same afternoon:
`blob-storage.md` picked R2, and the S3-SDK-not-vendor-SDK choice inherited from
`archive/storage-uploads.md` is what kept the target open long enough to change
it.

**What this does cost:** durability is now entirely your backup job, where an
object store would have provided it. §5 is not optional.

### 2.1 An object store is now a hard prerequisite — added 15 Aug 2026

The sentence above — "object storage is not a blocker for this deployment" — was
true when it was written and **is no longer true**. `blob-storage.md` phases 2–4
shipped, so the store is not an improvement waiting its turn; it is where the
images in every post now live. Deploying this stack without one produces a site
whose posts render broken pictures, and no error that names the cause.

Three concrete things this adds to the deploy, none of which appear anywhere
else in this document:

- **`S3_ENDPOINT` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET`
  must be set in the production environment.** `src/lib/storage.ts` reads them
  into module-level constants at import, and `isStorageConfigured()` is what
  every write path checks before falling back. The failure mode of omitting them
  is not a crash: uploads quietly go back to inlining data URIs, which is the
  behaviour this whole plan spent four phases removing.
- **`docker-compose.prod.yml` has no object-store service and should not grow
  one.** The dev compose runs MinIO; production points at R2, which is off-box
  by design — that is the choice `blob-storage.md` §7 made, for the reason that
  Cloudflare already fronts the origin.
- **The bucket is now primary data.** It is not a cache and it is not
  reconstructible: once `Revision.data` holds `/api/blob/<hash>` instead of the
  bytes, the object *is* the picture. §5 has to cover it, and did not.

## 3. Restoring what was deleted

`e9018f00` deleted four files and one config line. Three come back close to
verbatim — `git show e9018f00^:<path>` recovers them, and the Dockerfile in
particular is good work worth keeping.

This table is a record of what was done on 15 Aug, not a checklist to run
today: both background rows were undone on 27 Aug (§2's update note), so a
reader working from it would re-add a volume for deleted data.

| Artifact | Action |
| --- | --- |
| `Dockerfile` | Restore. ~~Add the backgrounds `mkdir`/`chown` (§2)~~ — added, then removed 27 Aug |
| `docker-compose.prod.yml` | Restore. Add `caddy`, ~~add the backgrounds volume~~ (added, then removed 27 Aug), drop the published `3000:3000` in favour of proxying |
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
2. **Nightly logical backup, offsite.** `pg_dump` plus the upload volume
   (singular since 27 Aug 2026 — §2's update note), pushed to an object store on
   a *different provider* — Backblaze B2 or
   Cloudflare R2, both cents-per-month at this size, R2 with no egress charge on
   restore. This is what survives corruption, a bad migration, and the VPS
   account itself going away.

   **The blob bucket belongs in this set too, and on a different provider from
   itself** (added 15 Aug 2026, §2.1). It is also, by size, most of what there is
   to back up: after §10.2 the disk holds ~180KB. It holds the only copy of every image in
   every post; a `pg_dump` taken without it restores documents whose pictures
   are gone, and the database will not even show the loss — the `src` is a
   perfectly valid path to an object that no longer exists. Backing R2 up *to*
   R2 satisfies the letter of "offsite" and none of its point.

   A useful property while doing it: blobs are content-addressed and immutable,
   so a copy is a pure add — no object ever changes, and a sync only ever grows.
   That makes this the cheapest of the three to back up, not the hardest.

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
  `changes-detection.md` §6 is rewritten for this target, and now says the live
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

- ~~**AI routes are unrated.**~~ **Resolved 15 Aug 2026, by a change of owner
  rather than by a rate limit.** This said `/api/completion` and `/api/copilot`
  spend real money per request against `ANTHROPIC_API_KEY` while registration is
  open to anyone completing an OAuth sign-in. `archive/byo-provider-keys.md`
  shipped: there is no deployment key of any kind — `src/lib/ai/providers.ts`
  takes a `ProviderCredentials` and refuses without one, and a user with no key
  for the provider they picked is told to add one. A stranger signing in can now
  only spend their own credits. The routes are still unrated, but unrated
  against the caller's own account is an ordinary product decision rather than a
  launch blocker.
- **Administration is psql-only.** No UI for disabling an account.
- **Middleware is a no-op.**

## 9. Order of work

1. ~~Restore `Dockerfile`, `.dockerignore`, `output: "standalone"`; delete
   `vercel.json`; resolve `IS_VERCEL` (§3)~~ — done, `118a5a8c`
2. ~~Restore `docker-compose.prod.yml` with `caddy` and **both** upload volumes
   (§2)~~ — done, `118a5a8c`. The backgrounds volume was the bug fix, and was
   itself removed on 27 Aug once the data turned out to be dead (§2)
3. ~~Re-status `archive/storage-uploads.md` (§2) and rewrite `changes-detection.md`
   §6 (§7)~~ — done. Both stated a dead premise
4. ~~Build the image once, locally, to prove the Dockerfile~~ — done. It failed
   first time on §4.1 and passes now
5. Provision the box, point DNS, bring the stack up, confirm TLS
6. **Create the R2 bucket and set `S3_*` in the production environment (§2.1)** —
   new, and it belongs before the first deploy rather than after: without it the
   app runs, serves posts, and shows broken images
7. Migrate the existing uploads onto the volume — **~180KB, not the 19MB this
   step used to say.** The other 19MB were background images, and `blob-storage.md`
   §10.2 deleted them rather than moving them: the feature was already gone. What
   is left is attachments, which stay on the filesystem for the reason §10.2
   gives
8. **Backups and a rehearsed restore (§5)** — before this is load-bearing, not
   after. Three things to back up, and the middle one is now the smallest by
   three orders of magnitude: the database, the upload volume (singular), and the
   blob bucket
9. **A scheduler, and its first two jobs.** There is none in the repo — no cron,
   no timer unit, no `schedule:` workflow. §5's nightly backup needs one, and so
   does `pnpm blobs:collect` (`blob-storage.md` §11.2, which records the trap:
   the runner stage of the Dockerfile carries neither `src/` nor `tsx`, so
   `docker compose exec app` cannot run any script in `prisma/scripts/`). Decide
   the mechanism once, for both
10. External uptime check against `/api/health`, alerting somewhere you read
9. Verify the change feed end to end *through* Cloudflare (§1.1, and
   `changes-detection.md` §6.2 — the failure is silent, so this is a real step
   rather than a formality)
