#!/usr/bin/env bash
#
# Nightly logical backup — docs/plans/production-deployment.md §5, layer 2.
#
#   ops/backup.sh
#
# Two of the three durable stores: the database and the attachments volume. The
# third — the blob bucket, which is almost all of the bytes — is ops/blobs-sync.sh,
# because it copies bucket-to-bucket and never touches this box.
#
# Three things here are deliberate:
#
#   * `pg_dump` runs *inside* the postgres container, so the dump is always taken
#     by the same major version that wrote the data. A host-installed pg_dump
#     drifts from the server on the first `apt upgrade` and fails at the worst
#     moment.
#   * The dump is verified before it is called a backup. `pg_restore --list`
#     parses the whole custom-format archive, so a truncated or half-written file
#     is caught here rather than during a restore. An unverified dump is a file,
#     not a backup.
#   * Promotion to weekly/monthly is a copy of the same verified artifact, not a
#     separate dump. Nothing is dumped twice, and the monthly is a file that was
#     checked the night it was made.
set -euo pipefail
. "$(dirname "$(readlink -f "$0")")/lib.sh"

need docker
need rclone

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DAY_OF_WEEK="$(date -u +%u)"   # 7 = Sunday
DAY_OF_MONTH="$(date -u +%d)"
WORK="$BACKUP_DIR/daily/$STAMP"

mkdir -p "$WORK"
# The dump holds every post and every credential in the system.
chmod 700 "$BACKUP_DIR" "$BACKUP_DIR/daily" "$WORK"

cleanup_failed() {
  # A partial directory that survives looks exactly like a good backup to
  # tomorrow's operator. Take it with us.
  [ -n "${DONE:-}" ] || rm -rf "$WORK"
}
trap cleanup_failed EXIT

log "backup $STAMP starting"

# ---- Database ----------------------------------------------------------------
log "dumping database $PG_DB"
compose exec -T postgres pg_dump -U "$PG_USER" -d "$PG_DB" -Fc --no-owner \
  > "$WORK/db.dump"

# Verified by the container's pg_restore, not the host's: a minimal VPS has no
# postgres client installed, and one installed by `apt` drifts from the server
# on the first upgrade — a 16 client cannot read a 17 archive at all
# ("unsupported version (1.16) in file header").
#
# Note the missing filename. `pg_restore --list` reads bare stdin happily, but
# `pg_restore --list /dev/stdin` fails with "did not find magic string in file
# header" even on the matching version — a custom-format archive named as a file
# is opened seekably. Both forms look identical in a script and only one works.
compose exec -T postgres pg_restore --list < "$WORK/db.dump" > /dev/null \
  || die "dump did not verify — refusing to publish it as a backup"
DB_BYTES="$(stat -c %s "$WORK/db.dump")"
log "database dump verified, $(human "$DB_BYTES")"

# ---- Attachments -------------------------------------------------------------
#
# Read through the app container rather than by mounting the volume by name:
# compose prefixes volume names with the project, so naming it here would work
# on the box it was written on and nowhere else.
log "archiving attachments volume"
compose exec -T app tar -C /app/var/uploads -cf - . | gzip -9 > "$WORK/uploads.tar.gz"
UP_BYTES="$(stat -c %s "$WORK/uploads.tar.gz")"
gzip -t "$WORK/uploads.tar.gz" || die "attachments archive is corrupt"
log "attachments archived, $(human "$UP_BYTES")"

# ---- Manifest ----------------------------------------------------------------
{
  echo "taken:      $STAMP"
  echo "host:       $(hostname)"
  echo "database:   $PG_DB (db.dump, $(human "$DB_BYTES"))"
  echo "uploads:    uploads.tar.gz ($(human "$UP_BYTES"))"
  echo "app image:  $(compose images app --format json 2>/dev/null | head -c 400 || echo unknown)"
  echo
  echo "This backup does NOT contain the blob bucket, which holds the images in"
  echo "every post. That is ops/blobs-sync.sh, copied to BLOBS_OFFSITE_REMOTE."
  echo "Restoring this alone gives you documents whose pictures are gone, and"
  echo "the database will not report the loss."
} > "$WORK/MANIFEST"

# Relative names, so `sha256sum -c` works wherever the directory is restored to.
(cd "$WORK" && sha256sum db.dump uploads.tar.gz MANIFEST > SHA256SUMS)

# ---- Offsite -----------------------------------------------------------------
log "copying to $OFFSITE_REMOTE/daily/$STAMP"
rclone copy "$WORK" "$OFFSITE_REMOTE/daily/$STAMP" --checksum

if [ "$DAY_OF_WEEK" = "7" ]; then
  log "Sunday — promoting to weekly"
  rclone copy "$WORK" "$OFFSITE_REMOTE/weekly/$STAMP" --checksum
fi
if [ "$DAY_OF_MONTH" = "01" ]; then
  log "first of the month — promoting to monthly"
  rclone copy "$WORK" "$OFFSITE_REMOTE/monthly/$STAMP" --checksum
fi

# ---- Retention ---------------------------------------------------------------
prune() {
  local class="$1" age="$2"
  rclone delete "$OFFSITE_REMOTE/$class" --min-age "$age" || true
  rclone rmdirs "$OFFSITE_REMOTE/$class" --leave-root || true
}
prune daily   "$OFFSITE_DAILY_KEEP"
prune weekly  "$OFFSITE_WEEKLY_KEEP"
prune monthly "$OFFSITE_MONTHLY_KEEP"

find "$BACKUP_DIR/daily" -mindepth 1 -maxdepth 1 -type d \
  -mtime "+${LOCAL_KEEP_DAYS}" -exec rm -rf {} + || true

DONE=1
mkdir -p "$STATE_DIR"
date -u +%s > "$STATE_DIR/backup-ok-at"
log "backup $STAMP complete"
