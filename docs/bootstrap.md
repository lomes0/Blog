# Bootstrap — Run the Project Locally

A quick, from-zero guide to getting **blog-simple** running on your machine.

## Prerequisites

- **Node.js** ≥ 18 (repo is developed on Node 24). Use `nvm` if you have it:
  `source ~/.nvm/nvm.sh && nvm use`
- **Docker** (for a local PostgreSQL instance)
- **npm** (bundled with Node)

## 1. Install dependencies

```bash
npm install
```

`postinstall` runs `patch-package` automatically to apply the patches in
`/patches/`.

## 2. Start PostgreSQL in Docker

A `docker-compose.yml` is included at the repo root. Start Postgres with:

```bash
docker compose up -d
```

- Stop it with `docker compose stop`; start it again with
  `docker compose start`.
- Data persists in the `blog-postgres-data` volume across restarts.
- Tear it down (⚠️ deletes the volume/data) with `docker compose down -v`.

The Compose service exposes Postgres on `localhost:5432` with user/password/db
all set to `blog` — matching the `DATABASE_URL` in the next step.

## 3. Configure environment variables

Copy the example file and fill in the essentials:

```bash
cp .env.example .env
```

Minimum needed to boot the app and connect to the database above:

```bash
# Database (matches the docker container from step 2)
DATABASE_URL="postgresql://blog:blog@localhost:5432/blog?schema=public"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="<run: openssl rand -base64 32>"

# Public base URL
PUBLIC_URL="http://localhost:3000"
```

Generate a secret with:

```bash
openssl rand -base64 32
```

### Optional variables

Leave these blank unless you need the feature:

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth sign-in. Without
  them, cloud auth is unavailable, but local (IndexedDB) documents still work
  offline.
- `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OLLAMA_API_URL`,
  `AZURE_*` — AI completion providers.
- `NEXT_PUBLIC_FASTAPI_URL` — external FastAPI backend.
- `BROWSERLESS_URL` — remote Chrome for PDF export (falls back to local
  Puppeteer).

## 4. Set up the database schema

Generate the Prisma client and apply the migrations:

```bash
npx prisma generate
npx prisma migrate dev
```

Browse the database anytime with:

```bash
npx prisma studio
```

## 5. Run the app

```bash
npm run dev
```

Open <http://localhost:3000>.

For a production-style run:

```bash
npm run build
npm start
```

## Production (Vercel + Supabase)

**Decided 13 Aug 2026, and not yet done.** The container path this section used
to document — `Dockerfile`, `docker-compose.prod.yml`, `fly.toml` — is deleted.
The target is Vercel for the app and Supabase for Postgres and object storage.
The steps above still describe local development, and `docker-compose.yml` (dev
Postgres, step 2) is untouched.

**The app cannot be deployed as it stands.** Uploads are written to the local
filesystem, which a serverless function does not have — see
[`plans/storage-uploads.md`](./plans/storage-uploads.md), which is the blocking
work and now reads as a prerequisite rather than an improvement.

What deploying will involve, once that lands:

- **Two database URLs.** Vercel functions are short-lived and numerous, so
  `DATABASE_URL` points at Supabase's pooled port (`:6543`, transaction mode)
  while `DIRECT_URL` points at `:5432` for `prisma migrate deploy`. Prisma needs
  both named in `schema.prisma`.
- **`CHANGES_DATABASE_URL` must be the direct connection.** `LISTEN` does not
  survive a transaction-mode pooler and fails _silently_ — the connection
  succeeds, the `LISTEN` succeeds, and notifications never arrive. Whether the
  change feed works on serverless at all is an open question, not a settled one:
  see [`plans/changes_detection.md`](./plans/changes_detection.md) §6.
- **Migrations are not automatic.** There is no release command; run
  `npx prisma migrate deploy` against `DIRECT_URL` as a deploy step or by hand.
- **OAuth callbacks** must be re-registered at GitHub/Google for the production
  origin: `{PUBLIC_URL}/api/auth/callback/<provider>`.
- **PDF export** has no Chromium on Vercel. Set `BROWSERLESS_URL` to a remote
  Chrome, or the route fails in production while working locally.

## Common commands

```bash
npm run lint         # ESLint
npm run clean        # Remove .next and cached files
npm run rebuild      # Clean + build
```

## Troubleshooting

- **`ECONNREFUSED` to Postgres** — the container isn't running. Check with
  `docker ps`; start it with `docker start blog-postgres`.
- **`DATABASE_URL` errors from Prisma** — confirm the credentials/port match the
  docker container from step 2 and that `.env` is loaded.
- **Migrations out of sync** — reset the dev database with
  `npx prisma migrate reset` (⚠️ drops all data).
- **Hydration errors in the browser** — see
  [`guides/hydration.md`](./guides/hydration.md).
