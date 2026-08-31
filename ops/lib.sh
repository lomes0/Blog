# Shared setup for the ops scripts — docs/plans/production-deployment.md §5, §9.
#
# Sourced, never executed. Every script here begins:
#
#   set -euo pipefail
#   . "$(dirname "$(readlink -f "$0")")/lib.sh"
#
# What this file establishes: where the stack lives, how to talk to it, where
# state and backups go, and one logging convention so journald output from four
# different jobs reads the same way.

# The checkout, one directory up from ops/.
BLOG_DIR="${BLOG_DIR:-$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)}"
OPS_DIR="$BLOG_DIR/ops"

# Operator configuration. Not committed — ops.env.example is the template.
# Absent is fatal rather than defaulted: every value in it names somewhere data
# is written or read, and a silently defaulted backup destination is the failure
# this whole layer exists to prevent.
OPS_ENV="${OPS_ENV:-$OPS_DIR/ops.env}"
if [ -f "$OPS_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$OPS_ENV"
  set +a
else
  echo "ops: no $OPS_ENV — copy ops/ops.env.example and fill it in" >&2
  exit 1
fi

# The application's own .env, for the Postgres credentials. Read with a grep
# rather than sourced: it holds secrets this layer has no business exporting
# into the environment of a `docker compose exec`.
env_of() {
  local key="$1" default="${2-}" line
  line="$(grep -E "^${key}=" "$BLOG_DIR/.env" 2>/dev/null | tail -n 1 || true)"
  if [ -z "$line" ]; then printf '%s' "$default"; return; fi
  line="${line#*=}"
  line="${line%\"}"; line="${line#\"}"
  line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

PG_USER="$(env_of POSTGRES_USER blog)"
PG_DB="$(env_of POSTGRES_DB blog)"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/blog-simple}"
STATE_DIR="${STATE_DIR:-/var/lib/blog-simple}"

compose() {
  docker compose -f "$BLOG_DIR/docker-compose.prod.yml" "$@"
}

log()  { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die()  { printf '%s  ERROR: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is not installed on this host"
}

# Human sizes without depending on GNU numfmt being present.
human() {
  local b="${1:-0}"
  if   [ "$b" -ge 1073741824 ]; then awk -v b="$b" 'BEGIN{printf "%.1f GB", b/1073741824}'
  elif [ "$b" -ge 1048576 ];    then awk -v b="$b" 'BEGIN{printf "%.1f MB", b/1048576}'
  elif [ "$b" -ge 1024 ];       then awk -v b="$b" 'BEGIN{printf "%.0f kB", b/1024}'
  else printf '%s B' "$b"; fi
}
