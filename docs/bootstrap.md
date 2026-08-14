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

## Production (a single VPS running Docker Compose)

**Decided 13 Aug 2026, not yet deployed.** The full design and its reasoning are
in [`plans/production-deployment.md`](./plans/production-deployment.md); this is
the operational summary. Two earlier decisions (Vercel + Supabase, and a
container on Fly) are recorded there because their reasoning still reads — they
are not live.

The stack is three services on a private Compose network, one published:

```
Internet → caddy :80/:443 → app :3000 → postgres (not published)
(via Cloudflare)
```

Everything needed is committed: `Dockerfile`, `docker-compose.prod.yml`,
`Caddyfile`. The steps above still describe local development, and
`docker-compose.yml` (dev Postgres, step 2) is a separate, untouched thing.

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

What deploying involves:

- **`.env` needs three more keys** beyond development: `APP_DOMAIN` (the
  hostname Caddy gets a certificate for — the stack refuses to start without
  it), and `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`. Set
  `NEXTAUTH_URL` and `PUBLIC_URL` to `https://$APP_DOMAIN`.
- **`DATABASE_URL` is overridden by the compose file**, so it points at the
  `postgres` service rather than at whatever a copied `.env` says. Note that
  `.env` builds it from `${PGUSER}`/`${PGHOST}`/… and **Compose does not expand
  `${...}` in `env_file`** — that override is what makes it work. Do not remove
  it, and do not add new interpolated variables expecting them to resolve in the
  container.
- **`CHANGES_DATABASE_URL` stays unset.** It falls back to `DATABASE_URL`, which
  is correct here because there is no connection pooler in this topology. See
  [`plans/archive/changes-detection.md`](./plans/archive/changes-detection.md)
  §6.1.
- **Migrations run on boot** — the app's compose `command` is
  `prisma migrate deploy && node server.js`. That is safe only because there is
  exactly one instance.
- **OAuth callbacks** must be re-registered at GitHub/Google for the production
  origin: `{PUBLIC_URL}/api/auth/callback/<provider>`.
- **TLS is automatic** via Caddy and Let's Encrypt. If Cloudflare proxies the
  domain, set it to Full (strict).
- **Verify the change feed *through* the proxy.** A buffering proxy breaks
  `/api/events` silently — the connection opens, the browser fires `open`, and
  no event ever arrives. Nothing errors.
- **Backups are yours now**, and nothing else here fails as expensively:
  nightly `pg_dump` plus the upload volumes, pushed to a different provider, and
  a restore you have actually rehearsed. `plans/production-deployment.md` §5.

**Uploads** live on two named volumes — `/app/var/uploads` (attachments) and
`/app/public/uploads/directories` (backgrounds). Both are required; the second
holds most of the data and is the easier one to forget, because it sits under
`public/` with the baked-in static assets. The longer-term direction is one
content-addressed blob store on R2 covering attachments, backgrounds and editor
images alike — [`plans/blob-storage.md`](./plans/blob-storage.md) — but the
volumes stay mounted until its phase 3 verification passes.

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
