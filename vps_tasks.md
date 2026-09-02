# VPS — open tasks

Derived from [docs/plans/production-deployment.md](./docs/plans/production-deployment.md)
§9 (order of work) read against §10.3 and [docs/plans/blob-storage.md](./docs/plans/blob-storage.md)
§11.2, on 2 Sep 2026.

**Steps 1–4 are done and steps 8–9 are written but have never run.** Everything
below is what is left. The whole list is blocked on one thing: there is no box.

**Decided 2 Sep 2026:** build in CI, push to GHCR, `docker compose pull` on the
box — §4's recommendation. That sizes the VPS for the runtime (2 vCPU / 4GB,
~€5/mo) rather than for a build that compiles Excalidraw, MathLive and GeoGebra,
and keeps the site warm through a deploy. The repo side of it is done; see the
last section.

## 0. Purchases and decisions — the actual blocker

None of this is code, and nothing else can start without it.

- [ ] **A VPS.** 2 vCPU / 4GB (~€5/mo) if images are built in CI and pulled;
      4 vCPU / 8GB (~€9/mo) if you deploy with `up --build` on the box.
      `node_modules` is 1.6GB and the build compiles Excalidraw, MathLive and
      GeoGebra — sizing for the runtime and then building on it is the mistake
      §4 names. Building on-box also degrades the live site for the duration.
- [ ] **A domain**, and `APP_DOMAIN` set for it. Caddy obtains and renews
      Let's Encrypt certificates from the hostname alone; that is the entire
      reason it is preferred to nginx here.
- [ ] **Cloudflare in front** (free, recommended by §1.1) — edge TLS, caching of
      `/_next/static/*`, and the origin IP hidden.
- [ ] **An R2 bucket** for blobs (§2.1) — see task 2, it is a hard prerequisite
      rather than a follow-up.
- [ ] **A second-provider bucket** (B2 in `ops/ops.env.example`) for backups and
      the offsite blob copy. The providers must differ; that is the point.
- [x] **Build strategy: CI → GHCR → `docker compose pull`** (§4's
      recommendation), decided 2 Sep 2026. Both compose paths still work —
      leaving `APP_IMAGE` empty falls back to `up -d --build` on the box.

## 1. Step 5 — provision, DNS, TLS

- [ ] Bring up the box, install Docker, put the stack at `/opt/blog-simple`
      (the systemd units hardcode that path in `WorkingDirectory=` /
      `ExecStart=` — adjust both if it lives elsewhere).
- [ ] Write the production `.env` from **`.env.production.example`** (written
      2 Sep 2026; do not copy `.env.example`, which is dev-shaped). It must set:
      - `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` — the compose file
        and every ops script default these to `blog`/`blog`, **a password
        published in this repository**. Postgres is unpublished on the compose
        network so it is not immediately reachable, but it is still wrong to run.
      - `NEXTAUTH_URL` / `NEXTAUTH_SECRET` / `PUBLIC_URL`
      - at least one OAuth pair (`GITHUB_CLIENT_ID`+`_SECRET` or the Google
        pair) — with neither, sign-in is unavailable and the server logs an
        error at startup
      - `AI_CREDENTIAL_KEYS` (+ `_KEY_VERSION`) — without it every stored
        per-user provider key is unreadable
      - the `S3_*` block from task 2
      - `APP_DOMAIN` for Caddy
      - `APP_IMAGE` / `OPS_IMAGE` — the GHCR tags from the build workflow's run
        summary. Pin the `sha-` tag, not `:latest`, or a rollback has nothing to
        roll back to. Both must name the same commit.
- [ ] Point DNS at the box **before** the first `up`: Caddy's ACME challenge is
      served on port 80 and fails if the name does not already resolve there.
- [ ] `docker compose -f docker-compose.prod.yml -f docker-compose.ghcr.yml pull`
      then `… up -d`; confirm TLS and that
      `/api/health` answers. Migrations apply on boot (`prisma migrate deploy`),
      which is safe only because there is exactly one instance.

## 2. Step 6 — R2, and it goes *before* the first deploy

- [ ] Create the bucket; set `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`,
      `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`.
- [ ] Do **not** add an object-store service to `docker-compose.prod.yml`. Dev
      runs MinIO; production points at R2, off-box by design.

**Why it is not a follow-up:** omitting `S3_*` does not crash. `isStorageConfigured()`
returns false and uploads quietly go back to inlining data URIs — the exact
behaviour blob-storage spent four phases removing — while every existing post
renders broken pictures with no error naming the cause. The bucket is primary
data, not a cache: once `Revision.data` holds `/api/blob/<hash>`, the object
*is* the picture.

## 3. Step 7 — the filesystem migration

- [ ] Copy the existing attachments onto the `blog-attachments` volume: 11
      files, ~180KB. That is all of it. It used to read "19MB of uploads"; the
      other 19MB were background images, orphans of a removed feature, deleted
      27 Aug. Attachments stay on disk because `PUT /api/attachments/[filename]`
      edits in place and content addressing cannot express that.

## 4. Steps 8–9 — make `ops/` real

Written 31 Aug, syntax-checked, never run against a machine. Runbook is
[ops/README.md](./ops/README.md).

- [ ] `apt install -y rclone curl python3`
- [ ] `cp ops/ops.env.example ops/ops.env`, fill it, `chmod 600`
- [ ] `rclone config` **as root** (the timers run as root): the live R2 remote,
      and the offsite remote on a different provider. Consider wrapping the
      backup destination in an rclone `crypt` remote — the dump carries every
      post, every user row, the SHA-256 of every agent token and the ciphertext
      of every AI provider key.
- [ ] Install the units from `ops/systemd/`, enable the four timers:
      `blobs-sync` (nightly 02:17), `backup` (03:17), `blobs-collect` (Sun
      04:17), `restore-drill` (1st Sat 05:17).
- [ ] Set `ALERT_WEBHOOK`. It is the one setting whose omission is **silent** —
      deliberately, so that an unconfigured alert is not itself a failing unit.
- [ ] Run one real restore drill by hand before trusting the timer.

Two things already paid for by testing (§10.1), worth not rediscovering:
Postgres is pinned to **17** in all three compose files because `pg_restore` 16
cannot read a 17 archive at all — it fails on the header, before a row. And
`pg_restore --list` must be given a filename; reading bare stdin fails on a
*valid* archive, in the direction that condemns every good backup as corrupt.

**This closes `blob-storage.md`.** The collector has been written and unscheduled
since it was built, because there was nowhere to schedule it; §11.2 is the only
thing keeping that plan out of the archive. Note `blobs-collect.sh` refuses to
run unless a successful blob copy is on record and younger than
`BLOBS_SYNC_MAX_AGE_DAYS` — it is the only thing in the system that deletes
bytes. Do not route around that guard.

## 5. Step 10 — verify the change feed *through* Cloudflare

- [ ] Open `/api/events` end to end through the proxy and confirm events
      actually arrive.

A real step, not a formality: a proxy that buffers SSE produces a connection
that opens, fires `open`, and then delivers nothing, forever. The route already
sends `X-Accel-Buffering: no` and `Cache-Control: no-cache, no-transform`, which
is what Cloudflare reads — but the failure is silent, so it must be observed
rather than assumed.

## 6. Step 11 — uptime check

- [ ] External check against `/api/health`, alerting somewhere you actually
      read. Off-box by definition, so no amount of `ops/` covers it (§10.3).

## Repo-side work — done 2 Sep 2026

- [x] **`.env.production.example`.** Production-shaped: R2 rather than MinIO,
      no defaulted `blog`/`blog`, and it says which variables compose overrides
      anyway (`DATABASE_URL`) so setting them here is not mistaken for working.
- [x] **`.github/workflows/build.yml`** — builds both stages of the one
      Dockerfile on every push to `main` and pushes them to GHCR: the `runner`
      stage as the app, the `builder` stage as the `ops` one-shot image. PRs
      build but never push. amd64 only. The run summary prints the two `.env`
      lines to paste on the box.
- [x] **`docker-compose.ghcr.yml`** — the override that swaps `build:` for the
      registry images. `ops/lib.sh` adds it to its own compose calls whenever
      `.env` sets `APP_IMAGE`, and `ops/docker-compose.drill.yml` now resolves
      the same variable instead of a hardcoded `blog-simple:latest` that a
      registry-deployed box would never have.
- [x] `IS_VERCEL` — **already gone.** Nothing in the tree references it; the
      item was stale.

One thing found while doing this, not acted on: `NEXT_PUBLIC_DEMO_MODE` and the
`IS_DEMO` it feeds (`src/lib/demo.ts`) are read by nothing at all. The whole
file is dead.

## Cost, for reference

Roughly **€6–12/mo** all in: VPS 4–9, provider snapshots 1–2, offsite backup <1,
Cloudflare free.
