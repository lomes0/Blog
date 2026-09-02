# ops — backups, the scheduler, and the restore drill

The host side of [docs/plans/production-deployment.md](../docs/plans/production-deployment.md):
§5 (backups) and §9 step 9 (a scheduler, and its first two jobs). Everything
here runs **on the VPS**, as root, against the stack in
`docker-compose.prod.yml`. Nothing here runs in development.

The plan's §5 opens with "nothing else in this document can fail as
expensively", and that is the whole design brief. Each script below fails closed
and says why, rather than exiting 0 having done half a job.

## The mechanism, decided once

**systemd timers**, with the unit files committed here. §9 step 9 asked for one
mechanism for both jobs; this is it, and two more jobs arrived with it.

Why not the alternatives:

- **Host cron** keeps its schedule in a crontab that is not in the repo, has no
  `Persistent=` catch-up after downtime, and no `OnFailure=` hook — so a failed
  backup is a line in a mail spool nobody reads.
- **A scheduler sidecar** (ofelia and friends) has to mount the Docker socket,
  which is root on a box that also terminates TLS. A third-party image with that
  access, to run four shell scripts, is a bad trade.

One templated service — `blog-job@.service` — runs `ops/<instance>.sh`. Adding a
job is a script and a timer, never another service definition.

## What runs, and when

| Timer | When (UTC) | Script | Does |
| --- | --- | --- | --- |
| `blog-job@blobs-sync` | nightly 02:17 | `blobs-sync.sh` | Copies the blob bucket to a **second provider**. Append-only |
| `blog-job@backup` | nightly 03:17 | `backup.sh` | `pg_dump` + the attachments volume, verified, pushed offsite, pruned 7/4/6 |
| `blog-job@blobs-collect` | Sun 04:17 | `blobs-collect.sh` | `blobs:collect run` — the only thing in the system that deletes bytes |
| `blog-job@restore-drill` | 1st Sat 05:17 | `restore-drill.sh` | Restores last night's backup into a throwaway stack and proves it |

The order is the safety property, not a preference: the blob copy runs before
the collector's day, and `blobs-collect.sh` **refuses to run** if the last
successful copy is older than `BLOBS_SYNC_MAX_AGE_DAYS`. §5 states that ordering
in prose; a rule that lives only in prose is one an operator can get wrong at
2am.

## Three stores, two places, one gap to keep in mind

`backup.sh` covers the database and the attachments volume — both on the VPS
disk. It does **not** cover the blob bucket, which is off-box in R2 and holds
almost every byte the system has. That is `blobs-sync.sh`, and it is a separate
job on purpose: it copies bucket-to-bucket and never touches this machine.

A `pg_dump` restored without the bucket gives you documents whose pictures are
gone, and the database will not report the loss — `Revision.data` holds a
perfectly valid `/api/blob/<hash>` path to an object that no longer exists.
`backup.sh` writes that sentence into every backup's `MANIFEST`.

## Install

Assumes the stack is at `/opt/blog-simple` (adjust `WorkingDirectory=` and
`ExecStart=` in `blog-job@.service` and `blog-alert@.service` otherwise).

The production `.env` must set `POSTGRES_USER`, `POSTGRES_PASSWORD` and
`POSTGRES_DB`. Both the compose file and these scripts default them to
`blog`/`blog`, which is a password published in this repository — Postgres is
unpublished on the compose network, so it is not immediately reachable, but it
is still the wrong thing to run.

```bash
apt install -y rclone curl python3          # python3 is used only by alert.sh

cp ops/ops.env.example ops/ops.env
$EDITOR ops/ops.env                          # see the comments in it
chmod 600 ops/ops.env

rclone config                                # as root: the timers run as root
# Three remotes, and the providers must differ:
#   r2:      the live blob bucket        (BLOBS_SOURCE_REMOTE)
#   b2:      backups + the blob copy     (OFFSITE_*)
# Wrap the backup destination in an rclone `crypt` remote if you want the dumps
# encrypted at rest — the dump carries every post, every user row, the SHA-256
# of every agent token and the ciphertext of every AI provider key.

install -m 644 ops/systemd/*.service ops/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now \
  blog-job@blobs-sync.timer \
  blog-job@backup.timer \
  blog-job@blobs-collect.timer \
  blog-job@restore-drill.timer
```

Then, before trusting any of it, run each once by hand and read the output:

```bash
systemctl start blog-job@blobs-sync.service && journalctl -u blog-job@blobs-sync.service -n 40
systemctl start blog-job@backup.service     && journalctl -u blog-job@backup.service -n 40
ops/blobs-collect.sh --dry-run
ops/restore-drill.sh
```

`ops/restore-drill.sh` is the one that matters. Until it has passed once, there
is no evidence any of the rest works — and it is the only job here that reads
what the other three wrote.

## Running anything in `prisma/scripts/` in production

Minting an agent token, rotating AI keys, the collector: none of them can run in
the `app` container. The runner stage is a Next standalone bundle carrying
neither `src/` nor `tsx`, and every one of those scripts imports from
`src/lib/`. That is the trap `blob-storage.md` §11.2 records.

The `ops` service in `docker-compose.prod.yml` builds the *builder* stage, which
has the sources and the toolchain, and is `profiles: ["ops"]` so it never starts
with the stack:

```bash
docker compose -f docker-compose.prod.yml --profile ops run --rm ops \
  node --import tsx prisma/scripts/agent-token.ts mint --name laptop
```

Call the script directly, not through its `pnpm` alias: the aliases carry
`--env-file=.env`, and `.env` is in `.dockerignore` — correctly, a secrets file
does not belong in an image. Compose supplies the environment instead.

**On a box that deploys pre-built images**, add `-f docker-compose.ghcr.yml` to
that command, or it builds the entire builder stage — 1.6GB of `node_modules`
and a full Next build — to run one script. The scripts here already do it: `.env`
setting `APP_IMAGE` is what tells `ops/lib.sh` to append the override to every
compose call it makes, and to export `APP_IMAGE` so
`ops/docker-compose.drill.yml` resolves it too (compose reads `.env` from the
project directory, and for the drill file that is `ops/`, where there is none).
`APP_IMAGE` and `OPS_IMAGE` must name the same commit; see
[docker-compose.ghcr.yml](../docker-compose.ghcr.yml).

## Restoring for real

The drill is the rehearsal; this is the performance. Same steps, aimed at
production.

```bash
docker compose -f docker-compose.prod.yml stop app

STAMP=$(rclone lsf b2:blog-simple-backups/daily --dirs-only | sort | tail -1)
rclone copy "b2:blog-simple-backups/daily/$STAMP" /tmp/restore --checksum
(cd /tmp/restore && sha256sum -c SHA256SUMS)

# Database. --clean --if-exists so this is a replacement, not a merge onto
# whatever is already there.
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U blog -d blog --clean --if-exists --no-owner --no-acl < /tmp/restore/db.dump

# Attachments.
docker compose -f docker-compose.prod.yml start app
docker compose -f docker-compose.prod.yml exec -T app \
  tar -C /app/var/uploads -xzf - < /tmp/restore/uploads.tar.gz

# Blobs, if the bucket is what was lost. `copy`, so nothing offsite is touched.
rclone copy b2:blog-simple-blobs r2:blog-blobs --immutable

docker compose -f docker-compose.prod.yml restart app
```

Then open a post with a picture in it and look at the picture. §5 is emphatic
about this and it is not a formality: the database cannot tell you that half.

## The Postgres major is 17, and it matters

All three compose files pin `postgres:17`. The production file pinned 16 until
31 Aug 2026, which would have failed on the first restore: the only data that
will ever seed production is the development database, which runs 17.2, and
`pg_restore` 16 rejects a 17 archive on the header — `unsupported version (1.16)
in file header`, before it reads a row.

Two consequences to hold on to:

- **`ops/docker-compose.drill.yml` must stay in step with
  `docker-compose.prod.yml`.** A drill on an older major fails on the archive
  header and reports a perfectly good backup as corrupt.
- **Never verify or restore with a host-installed client.** `apt`'s postgres
  client drifts from the server on the first upgrade. Everything here goes
  through `compose exec postgres`, so the tool is always the one that wrote the
  data.

A related trap, since it costs an evening: `pg_restore --list` reads bare stdin
fine, but `pg_restore --list /dev/stdin` fails on a valid archive with `did not
find magic string in file header` — naming it as a file makes pg_restore open it
seekably. The two spellings are one argument apart and the wrong one condemns
good backups.

## What is deliberately not here

- **No monitoring or uptime checking.** §9 step 11 wants an external check
  against `/api/health`; external is the point, so it does not live on the box
  that would be down.
- **No log shipping or rotation.** Docker's json-file driver with its defaults
  is what this stack has. Fine at this size, and worth revisiting if it ever
  fills the disk.
- **No secrets management.** `.env` and `ops/ops.env` are files on the box, mode
  600. A single-tenant VPS is the threat model where that is the right answer.
- **No automatic failover, and no second box.** The recovery story is "restore
  onto a new VPS", which is exactly what `restore-drill.sh` rehearses.
