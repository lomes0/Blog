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
