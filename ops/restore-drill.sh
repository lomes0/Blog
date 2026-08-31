#!/usr/bin/env bash
#
# Rehearse the restore — docs/plans/production-deployment.md §5.
#
#   ops/restore-drill.sh              # pull last night's backup from offsite
#   ops/restore-drill.sh --local      # use the newest on-box copy instead
#   ops/restore-drill.sh --keep       # leave the drill stack up to poke at
#
# "Restore must be rehearsed, on a schedule, or it is not a backup. The common
# ending to this story is discovering the cron job broke in March."
#
# What this actually proves, in order:
#
#   1. The offsite copy is readable and its checksums match.       (the transport)
#   2. `pg_restore` reconstructs the database into a clean server. (the dump)
#   3. Every hash the restored database names exists in a bucket   (the half a
#      built from the *offsite blob copy*.                          pg_dump alone
#                                                                   cannot show)
#   4. The production image boots against both and answers /api/health.
#
# Step 3 is the one worth the machinery. A dump restores documents whose images
# are gone and reports nothing — `Revision.data` holds a perfectly valid
# `/api/blob/<hash>` path to an object that does not exist. So the drill restores
# a copy of the bucket and compares the two sets. Pointing it at live R2 would
# pass whatever the backup contains, which is the one thing it must not do.
set -euo pipefail
. "$(dirname "$(readlink -f "$0")")/lib.sh"

need docker
need rclone
need curl

SOURCE="offsite"
KEEP=""
for arg in "$@"; do
  case "$arg" in
    --local) SOURCE="local" ;;
    --keep)  KEEP=1 ;;
    *) die "unknown argument: $arg" ;;
  esac
done

DRILL="docker compose -f $OPS_DIR/docker-compose.drill.yml"
WORK="$(mktemp -d /tmp/blog-drill.XXXXXX)"

teardown() {
  if [ -n "$KEEP" ]; then
    log "leaving the drill stack up (--keep). Tear down with:"
    log "  $DRILL down -v"
    log "  rm -rf $WORK"
    return
  fi
  log "tearing down"
  $DRILL down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap teardown EXIT

# ---- 1. Fetch the backup -----------------------------------------------------
if [ "$SOURCE" = "local" ]; then
  SNAP="$(find "$BACKUP_DIR/daily" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"
  [ -n "$SNAP" ] || die "no local backup under $BACKUP_DIR/daily"
  log "using local backup $(basename "$SNAP")"
  cp "$SNAP"/* "$WORK/"
else
  STAMP="$(rclone lsf "$OFFSITE_REMOTE/daily" --dirs-only | sed 's:/$::' | sort | tail -n 1)"
  [ -n "$STAMP" ] || die "no backups under $OFFSITE_REMOTE/daily"
  log "pulling $STAMP from $OFFSITE_REMOTE"
  rclone copy "$OFFSITE_REMOTE/daily/$STAMP" "$WORK" --checksum
fi

( cd "$WORK" && sha256sum -c SHA256SUMS ) || die "backup failed its own checksums"
log "checksums verified"

# ---- 2. Restore the database -------------------------------------------------
log "starting drill Postgres and MinIO"
$DRILL up -d postgres minio >/dev/null
$DRILL up minio-init >/dev/null

log "restoring db.dump"
# --no-owner --no-acl: the dump's roles do not exist on a throwaway server, and
# a restore that fails on GRANT statements it was never going to need would look
# like a corrupt backup.
$DRILL exec -T postgres pg_restore -U drill -d drill --no-owner --no-acl \
  < "$WORK/db.dump" 2> "$WORK/restore.log" || {
    grep -v "^$" "$WORK/restore.log" | tail -n 20 >&2
    die "pg_restore failed"
  }

DOCS="$($DRILL exec -T postgres psql -U drill -d drill -tAc 'select count(*) from "Document"' | tr -d '[:space:]')"
BLOBS="$($DRILL exec -T postgres psql -U drill -d drill -tAc 'select count(*) from "Blob"' | tr -d '[:space:]')"
log "restored: $DOCS documents, $BLOBS blobs recorded"

# ---- 3. Restore a copy of the bucket, and reconcile ---------------------------
#
# The drill's MinIO is defined as an rclone remote through environment variables
# rather than in rclone.conf — it exists for the next ninety seconds and should
# not leave a remote behind in the operator's config.
export RCLONE_CONFIG_DRILL_TYPE=s3
export RCLONE_CONFIG_DRILL_PROVIDER=Minio
export RCLONE_CONFIG_DRILL_ENDPOINT=http://127.0.0.1:59000
export RCLONE_CONFIG_DRILL_ACCESS_KEY_ID=drill
export RCLONE_CONFIG_DRILL_SECRET_ACCESS_KEY=drilldrill
export RCLONE_CONFIG_DRILL_FORCE_PATH_STYLE=true

log "restoring the blob copy from $BLOBS_OFFSITE_REMOTE"
rclone copy "$BLOBS_OFFSITE_REMOTE" "drill:blog-blobs" --transfers 8 --stats-one-line --stats 30s

$DRILL exec -T postgres psql -U drill -d drill -tAc 'select hash from "Blob" order by hash' \
  | tr -d '[:blank:]' | grep -v '^$' | sort > "$WORK/db-hashes"
rclone lsf "drill:blog-blobs" | sed 's:/$::' | grep -v '^$' | sort > "$WORK/bucket-keys"

MISSING="$(comm -23 "$WORK/db-hashes" "$WORK/bucket-keys" | wc -l)"
ORPHAN="$(comm -13 "$WORK/db-hashes" "$WORK/bucket-keys" | wc -l)"

log "blobs the database names but the restored bucket lacks: $MISSING"
log "objects in the restored bucket the database does not name: $ORPHAN (expected — the collector's grace window)"

if [ "$MISSING" -gt 0 ]; then
  comm -23 "$WORK/db-hashes" "$WORK/bucket-keys" | head -n 10 >&2
  die "$MISSING referenced blobs are NOT in the backup — restoring this would lose pictures"
fi

# ---- 4. Boot the app against both --------------------------------------------
log "booting the production image against the restored data"
$DRILL up -d app >/dev/null

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:53000/api/health >/dev/null 2>&1; then
    OK=1; break
  fi
  sleep 2
done
[ -n "${OK:-}" ] || { $DRILL logs --tail 40 app >&2; die "the app did not become healthy against the restored data"; }

log "app healthy against the restored data"

mkdir -p "$STATE_DIR"
date -u +%s > "$STATE_DIR/drill-ok-at"
log "restore drill PASSED — $DOCS documents, $BLOBS blobs, 0 missing"
