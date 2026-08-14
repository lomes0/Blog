#!/bin/bash
# Build and run blog-simple. Usage: ./run.sh [dev|build|start|migrate|install]
set -e

cd "$(dirname "$0")"

[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"
[ -f .env ] && set -a && source .env && set +a

migrate() { pnpm exec prisma migrate deploy; }

case "${1:-dev}" in
  install)
    pnpm install
    pnpm exec prisma generate
    ;;
  dev)
    pnpm exec prisma migrate dev
    pnpm dev
    ;;
  build)
    pnpm install --frozen-lockfile
    pnpm exec prisma generate
    pnpm build
    ;;
  start)
    # No migrate here on purpose: schema changes are applied out-of-band, before
    # the server starts, so a rollback is a deploy rather than a restore.
    pnpm start
    ;;
  migrate)
    migrate
    ;;
  *)
    echo "usage: $0 [dev|build|start|migrate|install]" >&2
    exit 1
    ;;
esac
