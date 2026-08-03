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

# ---- Dependencies -----------------------------------------------------------
FROM base AS deps
# patch-package runs in `postinstall`, so patches must exist before `npm ci`.
# .npmrc matters too: it sets legacy-peer-deps, which is the mode the lock file
# was resolved under. Without it `npm ci` builds a different ideal tree and
# fails the sync check, so the image must install the way development does.
COPY package.json package-lock.json .npmrc ./
COPY patches ./patches
RUN npm ci

# ---- Builder ----------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `postinstall` only runs patch-package, so generate the client explicitly.
RUN npx prisma generate
RUN npm run build

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

# Attachment storage, deliberately outside ./public so Next cannot serve it
# statically (see src/lib/uploads.ts). Created here and owned by the runtime user
# so that a named volume mounted over it inherits that ownership — without this,
# the mount arrives root-owned and every upload fails with EACCES.
#
# NOTE: unless a volume IS mounted here, uploads live in the container's
# writable layer and are lost on redeploy.
RUN mkdir -p ./var/uploads/attachments \
  && chown -R nextjs:nodejs ./var

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Boot the standalone server. Migrations are applied out-of-band, before the
# server starts: Fly runs `prisma migrate deploy` as a release_command (see
# fly.toml); docker-compose.prod.yml applies them via a `command:` override.
# The prisma CLI is copied above so both mechanisms work against this image.
CMD ["node", "server.js"]
