#!/bin/bash

# Production startup script for blog-simple.
#
# Everything it used to do inline — .env, nvm, cd, migrate, start — now lives in
# run.sh, so the two cannot drift. Kept as a name for whatever unit or cron
# entry already points at it.
set -e

exec "$(dirname "$(readlink -f "$0")")/run.sh" start
