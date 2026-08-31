#!/usr/bin/env bash
#
# Say something when a job fails — docs/plans/production-deployment.md §5.
#
#   ops/alert.sh <unit-name>
#
# Wired in through systemd's `OnFailure=`, so it runs on any non-zero exit from
# any of the jobs. It posts the unit name and the last of its output to
# ALERT_WEBHOOK — Slack, Discord and ntfy all accept a JSON body of this shape;
# for anything else, replace the curl.
#
# With ALERT_WEBHOOK empty this exits 0 after logging. That is a deliberate
# no-op rather than an error: an unconfigured alert must not itself become a
# failing unit. It does mean nobody finds out, which is §5's "the cron job broke
# in March", so configure it.
set -euo pipefail
. "$(dirname "$(readlink -f "$0")")/lib.sh"

UNIT="${1:-unknown}"
TAIL="$(journalctl -u "$UNIT" -n 25 --no-pager 2>/dev/null | tail -n 25 || echo "(no journal)")"
TEXT="[${ALERT_LABEL:-blog-simple}] $UNIT FAILED on $(hostname)

$TAIL"

log "alert: $UNIT failed"

if [ -z "${ALERT_WEBHOOK:-}" ]; then
  log "ALERT_WEBHOOK is empty — journald only, nobody has been told"
  exit 0
fi

# The body is built by python3 rather than by interpolating into a JSON string:
# the tail being pasted in is log output, and a stack trace containing a quote or
# a newline would otherwise produce a malformed body that the webhook rejects —
# an alert that fails to send is worse than no alert, because the unit reports
# success either way.
BODY="$(TEXT="$TEXT" python3 -c 'import json,os; print(json.dumps({"text": os.environ["TEXT"]}))')"

# --max-time so a hung webhook cannot leave a unit running forever, and no `-f`:
# a webhook that answers 4xx should not turn the alert itself into a failure
# loop. The response is logged instead.
curl -sS --max-time 15 -X POST -H 'Content-Type: application/json' \
  --data-binary "$BODY" "$ALERT_WEBHOOK" || log "webhook post failed"
