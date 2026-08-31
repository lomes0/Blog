#!/usr/bin/env bash
#
# Copy the blob bucket to a second provider — docs/plans/production-deployment.md
# §5, and the half §5 was originally missing.
#
#   ops/blobs-sync.sh
#
# The bucket is primary data, not a cache: since blob-storage.md phase 2, a post's
# image *is* the object. No VPS snapshot reaches it and ops/backup.sh does not
# touch it, so without this job the store holding almost every byte has no backup
# at all.
#
# `copy`, never `sync`. A sync would propagate deletions — and the only thing that
# ever deletes an object is `pnpm blobs:collect`, whose mistakes are exactly what
# this copy exists to survive. Blobs are content-addressed and immutable, so an
# append-only copy is not a compromise: no object ever changes, and the copy only
# ever grows. Pruning it is a deliberate, manual act.
set -euo pipefail
. "$(dirname "$(readlink -f "$0")")/lib.sh"

need rclone

[ -n "${BLOBS_SOURCE_REMOTE:-}" ]  || die "BLOBS_SOURCE_REMOTE is not set"
[ -n "${BLOBS_OFFSITE_REMOTE:-}" ] || die "BLOBS_OFFSITE_REMOTE is not set"

log "copying $BLOBS_SOURCE_REMOTE -> $BLOBS_OFFSITE_REMOTE"

# --immutable is the assertion, not just an optimisation: if a key's bytes ever
# change, the content-addressing invariant has been violated somewhere and this
# job should fail loudly rather than quietly overwrite the good copy.
rclone copy "$BLOBS_SOURCE_REMOTE" "$BLOBS_OFFSITE_REMOTE" \
  --immutable --checksum --transfers 8 --stats-one-line --stats 30s

SRC_N="$(rclone size "$BLOBS_SOURCE_REMOTE"  --json | sed -n 's/.*"count":\([0-9]*\).*/\1/p')"
DST_N="$(rclone size "$BLOBS_OFFSITE_REMOTE" --json | sed -n 's/.*"count":\([0-9]*\).*/\1/p')"
log "source $SRC_N objects, offsite $DST_N objects"

# The offsite copy is allowed to hold *more* than the source — that is what
# append-only means once the collector has run. Fewer means the copy did not
# finish, and the marker below must not be written for a run that did not.
if [ "${DST_N:-0}" -lt "${SRC_N:-0}" ]; then
  die "offsite has fewer objects than the source — copy incomplete"
fi

mkdir -p "$STATE_DIR"
date -u +%s > "$STATE_DIR/blobs-synced-at"
log "blob copy complete"
