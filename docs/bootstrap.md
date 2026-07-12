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

- Stop it with `docker compose stop`; start it again with `docker compose start`.
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

## Production (Docker)

The steps above run the app directly on your machine. To build and run the
**production container** — a minimal Next.js standalone image wired to Postgres
— use `docker-compose.prod.yml` instead.

This is separate from the dev `docker-compose.yml`: the prod compose builds the
app image from the `Dockerfile`, keeps Postgres on a private network (not
published to the host), and points the app at the `postgres` service over the
compose network.

### 1. Prepare `.env`

The container reads secrets from `.env` via `env_file`. Make sure these are set
(the same ones from the local setup work):

```bash
NEXTAUTH_SECRET="<openssl rand -base64 32>"
NEXTAUTH_URL="http://localhost:3000"
PUBLIC_URL="http://localhost:3000"
# GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET if you want OAuth sign-in
```

> `DATABASE_URL` in `.env` is **ignored** here — the prod compose overrides it to
> `postgresql://blog:blog@postgres:5432/blog?connection_limit=10&schema=public`
> so the app targets the compose Postgres service instead of `localhost`.

### 2. Build and run

```bash
docker compose -f docker-compose.prod.yml up --build
```

On startup the app container runs `prisma migrate deploy` (applying any pending
migrations under a Prisma advisory lock), then boots `node server.js`.

### 3. Verify

Once healthy, check the DB-backed health probe:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","db":"up"}
```

The container also has a Docker `HEALTHCHECK` hitting `/api/health`; watch it
with `docker compose -f docker-compose.prod.yml ps`.

### Notes

- **Migrations:** run in the app container's start command. `migrate deploy`
  serializes across replicas via an advisory lock, so it's safe at small scale.
  If you scale to many instances, move migration to a dedicated release step.
- **Connections:** `connection_limit=10` caps the Prisma pool per container.
  Keep `replicas × connection_limit` under Postgres `max_connections` (~100 by
  default).
- **Managed Postgres:** the bundled `postgres:16` service is fine for a
  self-contained test. In real production, point `DATABASE_URL` at a managed
  instance (backups, PITR, failover) and drop the `postgres` service.
- **PDF export:** the image has no Chromium. Set `BROWSERLESS_URL` to a remote
  Chrome for PDF export in production.

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
