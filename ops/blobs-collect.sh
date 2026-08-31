#!/usr/bin/env bash
#
# Run the blob collector in production — docs/plans/blob-storage.md §11.2, which
# is what production-deployment.md §9 step 9 defers to.
#
#   ops/blobs-collect.sh [--dry-run]
#
# Two things make this a script rather than a line in a crontab.
#
# **The runner image cannot run it.** `prisma/scripts/collect-blobs.ts` imports
# from `src/lib/`, and the Dockerfile's runner stage carries neither `src/` nor
# `tsx` — it is a Next standalone bundle. So `docker compose exec app` cannot run
# any script in `prisma/scripts/`, and that is the trap §11.2 records. The `ops`
# service in docker-compose.prod.yml builds the *builder* stage, which has the
# sources and the toolchain, and is profile-gated so it never starts with the
# stack. Everything in prisma/scripts/ runs this way in production, including
# `pnpm mcp:token` and `pnpm ai:key`.
#
# **The collector is the only thing in the system that deletes bytes.** So it
# refuses to run unless there is a recent successful offsite copy of the bucket.
# §5 states the ordering — the backup must exist before the collector first runs
# — and an ordering that lives only in a document is one an operator can get
# wrong at 2am. Here it is a precondition that fails closed.
set -euo pipefail
. "$(dirname "$(readlink -f "$0")")/lib.sh"

need docker

DRY=""
[ "${1:-}" = "--dry-run" ] && DRY="--dry-run"

MARKER="$STATE_DIR/blobs-synced-at"
[ -f "$MARKER" ] || die "no successful blob copy on record ($MARKER) — run ops/blobs-sync.sh first. Refusing to collect."

AGE_DAYS=$(( ( $(date -u +%s) - $(cat "$MARKER") ) / 86400 ))
if [ "$AGE_DAYS" -gt "${BLOBS_SYNC_MAX_AGE_DAYS:-8}" ]; then
  die "last blob copy was ${AGE_DAYS}d ago, limit ${BLOBS_SYNC_MAX_AGE_DAYS:-8}d — refusing to collect against a stale backup"
fi
log "last blob copy ${AGE_DAYS}d ago — proceeding"

# `run --rm` rather than `up`: one-shot, no restart policy, exit code propagates
# to systemd so a failure is a failed unit rather than a line in a log.
#
# Invoked as node+tsx rather than through `pnpm blobs:collect`, because that
# alias carries `--env-file=.env` and `.env` is in .dockerignore — correctly, a
# secrets file does not belong in an image. Compose supplies the environment
# instead. Every other script in prisma/scripts/ runs the same way here.
compose --profile ops run --rm ops \
  node --import tsx prisma/scripts/collect-blobs.ts run $DRY
log "collection complete"
