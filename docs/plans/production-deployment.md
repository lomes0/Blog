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

Nothing else in this document can fail as expensively. **There are three durable
stores, in two places.** Postgres and the attachments volume are on the VPS disk,
where §2 chose to keep them; the blob bucket is in R2, where §2.1 put it. That
split is a durability improvement for the third store and a hole in the layer
below, and the two facts are easy to hold separately when they should be held
together.

**Two layers, because they fail differently:**

1. **Provider snapshots** (Hetzner et al. offer these for ~20% of server cost).
   Whole-box, trivial to enable, and the right tool for "the disk died."
   Insufficient alone for two reasons, not one: a corrupted database gets
   faithfully snapshotted and restoring is all-or-nothing — and **the box is now
   Postgres plus ~180KB of attachments, and nothing else.** No snapshot reaches
   R2, so the store holding almost every byte is entirely outside this layer.
2. **Nightly logical backup, offsite.** `pg_dump` plus the attachments volume
   (one volume, not two, since 27 Aug 2026 — §2's update note), pushed to an
   object store on a *different provider* — Backblaze B2 or Cloudflare R2, both
   cents-per-month at this size, R2 with no egress charge on restore. This is
   what survives corruption, a bad migration, and the VPS account itself going
   away.

   **The blob bucket belongs in this set too, and on a different provider from
   itself** (added 15 Aug 2026, §2.1). It holds the only copy of every image in
   every post; a `pg_dump` taken without it restores documents whose pictures are
   gone, and the database will not even show the loss — the `src` is a perfectly
   valid path to an object that no longer exists. Backing R2 up *to* R2 satisfies
   the letter of "offsite" and none of its point.

   **It is also almost all of the bytes**, which the three-item phrasing hides.
   Since §10.2 the disk side is ~180KB, so "the database, the volume and the
   bucket" is a set whose middle element rounds to nothing and whose last element
   is the job. Size the schedule and the retention against the bucket.

   A useful property while doing it: blobs are content-addressed and immutable,
   so a copy is a pure add — no object ever changes, and a sync only ever grows.
   That makes this the cheapest of the three to back up, not the hardest. The
   corollary is the one to watch: `pnpm blobs:collect` is the only thing that
   ever removes an object, so it must not be scheduled before this backup exists
   (§9 step 9).

**Restore must be rehearsed, on a schedule, or it is not a backup.** Restore
last night's dump into a throwaway Postgres and boot the app against it. The
common ending to this story is discovering the cron job broke in March.

**Point the rehearsal at a restored copy of the bucket, not at the live one.**
Against production R2 the drill passes whatever the backup contains, because the
images resolve from the store that was never tested — which is precisely the
half most likely to be broken, and the half whose loss the database cannot
report. Open a post with a picture in it and look at the picture.

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
7. Copy the existing attachments onto the volume — 11 files, ~180KB. This is the
   whole of the filesystem migration: it used to read "19MB of uploads", and the
   other 19MB were background images that turned out to be a removed feature's
   orphans (§2's 27 Aug note). Attachments stay on disk rather than moving to the
   store, for the reason `blob-storage.md` §10.2 gives
8. **Backups and a rehearsed restore (§5)** — before this is load-bearing, not
   after. Three things to back up, and the middle one is now the smallest by
   three orders of magnitude: the database, the upload volume (singular), and the
   blob bucket. — **Written 31 Aug 2026, not yet run against a box: `ops/`.**
   §10 is what was built and the two things testing it changed
9. ~~**A scheduler, and its first two jobs.**~~ — **decided and written 31 Aug
   2026: systemd timers, units in `ops/systemd/`.** Four jobs, not two. The trap
   `blob-storage.md` §11.2 records is answered by the profile-gated `ops` service
   in `docker-compose.prod.yml`, which builds the *builder* stage, and the
   ordering §5 states in prose — the bucket must be backed up before the
   collector first deletes anything — is now a precondition that fails closed
   rather than a sentence an operator can miss. §10.2 has the reasoning
10. Verify the change feed end to end *through* Cloudflare (§1.1, and
   `changes-detection.md` §6.2 — the failure is silent, so this is a real step
   rather than a formality)
11. External uptime check against `/api/health`, alerting somewhere you read

---

## 10. The ops layer, built 31 Aug 2026

§9's steps 8 and 9 are the two that had to exist before the box is load-bearing
rather than after, and neither of them needs a box to write. They are `ops/`,
with the runbook in [ops/README.md](../../ops/README.md). Nothing here has run
against a production machine yet — there isn't one — but the mechanism was
tested where it could be, and testing it changed two things (§10.1).

### 10.1 What testing changed

**`postgres:16` was wrong, and would have failed at the worst moment.** The
compose file has pinned 16 since it was recovered in `118a5a8c`. The only data
that will ever seed production is the development database, which runs **17.2**
— and `pg_restore` 16 does not read a 17 archive at all. It fails on the header,
before a single row, with `unsupported version (1.16) in file header`. Verified
directly, both images in hand. Pinned to 17 in all three compose files, which is
a line now and a `pg_upgrade` after the first deploy.

**`pg_restore --list /dev/stdin` does not work, and looks like it does.** The
backup verifies its own dump before publishing it, and the obvious spelling of
that check inside the container fails on a *valid* archive with `did not find
magic string in file header` — naming the file makes pg_restore open it
seekably. `pg_restore --list` reading bare stdin is fine. The two forms are one
argument apart, both plausible, and the failing one fails in the direction that
would have condemned every good backup as corrupt.

### 10.2 The decisions

**systemd timers, with the units in the repo.** Host cron keeps its schedule
outside the repo, has no catch-up after downtime, and has no failure hook — a
backup missed by a reboot is silent, which is §5's whole complaint. A scheduler
sidecar wants the Docker socket, which is root on the box that terminates TLS;
that is a bad trade for running four shell scripts. One templated unit,
`blog-job@.service`, runs `ops/<instance>.sh`, so a fifth job is a script and a
timer rather than another service definition.

**Four jobs, not §9's two.** The blob copy is its own job because it is
bucket-to-bucket and never touches the VPS, and the restore drill is a job
because §5 says a rehearsal on a schedule is what separates a backup from a
file. The drill is also the only thing that reads what the other three wrote.

**The collector's precondition is code, not prose.** §5 says the bucket must be
backed up before `blobs:collect` first runs, because it is the only thing in the
system that ever deletes an object. `ops/blobs-collect.sh` refuses to run unless
a successful blob copy is on record and younger than
`BLOBS_SYNC_MAX_AGE_DAYS`. The copy is `rclone copy`, never `sync`: propagating
a deletion made by the collector is precisely the failure the copy exists to
survive, and blobs being immutable means append-only costs nothing.

**The drill restores the bucket too, and reconciles it against the database.**
§5's rule is that the rehearsal must not resolve images from the live store,
because that passes whatever the backup contains — the pictures come from the
half that was never tested, and it is the half whose loss the database cannot
report. So the drill stands up its own MinIO, restores the offsite blob copy
into it, and fails if a single hash in `Blob` has no object. "Open a post and
look at the picture" as an assertion.

**The `ops` compose service answers `blob-storage.md` §11.2.** Nothing in
`prisma/scripts/` can run in the `app` container — the runner stage is a Next
standalone bundle with neither `src/` nor `tsx`, and all of them import from
`src/lib/`. A profile-gated service built from the `builder` stage runs them,
which also means minting an agent token and rotating an AI key are possible in
production at all; before this they were not.

### 10.3 What is still not covered

- **Nothing has run on a real box.** Every script is syntax-checked, the compose
  files and the calendar expressions validate, and the pg_dump/verify mechanism
  was tested against a live server — but the end-to-end path (offsite credentials,
  a real drill) is untested until §9 step 5 provisions something.
- **`ALERT_WEBHOOK` unset means nobody is told.** Deliberate — an unconfigured
  alert must not itself be a failing unit — and it is the one setting in
  `ops/ops.env` whose omission is silent.
- **No uptime check**, which is §9 step 11 and belongs off the box by definition.
