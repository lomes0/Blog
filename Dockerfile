# syntax=docker/dockerfile:1

# Multi-stage build producing a minimal Next.js standalone image.
# Requires `output: "standalone"` in next.config.ts.

# ---- Base -------------------------------------------------------------------
# Keep this major in step with .nvmrc, so the image builds on what development
# runs. Node 20 was end-of-life on 2026-04-30; 24 is supported to 2028-04-30.
FROM node:24-alpine AS base
# Prisma needs OpenSSL at runtime; libc6-compat covers native deps on musl.
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# pnpm comes from corepack, pinned by package.json's `packageManager` field, so
# the image installs with the same version development does.
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# ---- Dependencies -----------------------------------------------------------
FROM base AS deps
# patch-package runs in `postinstall`, so patches must exist before the install.
# The workspace manifests must be here too: pnpm resolves `packages/*` from
# pnpm-workspace.yaml, and --frozen-lockfile fails if one of them is missing.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/editor/package.json ./packages/editor/
COPY patches ./patches
#
# `node-linker=hoisted` gives this stage an npm-shaped, symlink-free
# node_modules. It is only set here, not in a committed .npmrc, so development
# keeps pnpm's normal linking. The runner below copies individual directories
# out of node_modules (.prisma, @prisma, prisma); under pnpm's default layout
# those are symlinks into .pnpm and would arrive dangling.
RUN pnpm install --frozen-lockfile --config.node-linker=hoisted

# ---- Builder ----------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `postinstall` only runs patch-package, so generate the client explicitly.
RUN pnpm exec prisma generate
RUN pnpm build

# ---- Runner -----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as an unprivileged user.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone server + static assets + public files (incl. generated PWA sw.js).
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma: generated client + query engine, the CLI + engines for `migrate
# deploy`, and the schema/migrations it applies.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/prisma ./prisma

# Upload roots, created here and owned by the runtime user so that a named
# volume mounted over either one inherits that ownership — without this, the
# mount arrives root-owned and every upload fails with EACCES.
#
# The two are separate because `src/lib/uploads.ts` deliberately separates them,
# and the split is a security boundary rather than an organisational one:
#
#   ./var/uploads/attachments      — private. Reachable only through
#                                    /api/attachments/[filename], which
#                                    authorizes against the parent document.
#                                    Outside ./public so Next cannot serve it
#                                    statically, bypassing that check.
#   ./public/uploads/directories   — background images, public by design and
#                                    served straight off the static tree.
#
# NOTE: unless a volume is mounted at BOTH, uploads live in the container's
# writable layer and are lost on redeploy. Backgrounds are the larger of the two
# by a wide margin, and are the easier one to forget precisely because they sit
# under ./public with the baked-in static assets — see
# docs/plans/production-deployment.md §2.
RUN mkdir -p ./var/uploads/attachments ./public/uploads/directories \
  && chown -R nextjs:nodejs ./var ./public/uploads

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Boot the standalone server. Migrations are applied out-of-band, before the
# server starts: docker-compose.prod.yml applies them via a `command:` override.
# The prisma CLI is copied above so that mechanism works against this image.
CMD ["node", "server.js"]
