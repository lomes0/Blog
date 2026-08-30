-- Phase A of docs/plans/schema-organization.md: the sweep that carries no
-- app-logic change. Four things, none of which alters a stored instant or a
-- stored role.
--
-- The timestamptz casts below are explicit about their source zone rather than
-- letting `SET DATA TYPE TIMESTAMPTZ` read it off the session. Both spellings
-- agree on a server whose TimeZone is UTC, which this one's is, but the
-- implicit form silently rewrites every timestamp in the table if a future
-- migration is ever applied over a connection that sets `timezone` — and it
-- would rewrite them wrongly and without complaint. `AT TIME ZONE 'UTC'` says
-- what the stored values are, which is a fact about the writer, not about
-- whoever runs the migration.
--
-- That the stored values *are* UTC was verified before this ran (§5 open
-- decision 2). The evidence: `AgentToken` rows minted by `mcp/smokeHttp.ts`
-- carry `new Date().toISOString()` — an unambiguous UTC instant — inside their
-- own `name`, and their bare `createdAt` agrees with it to the millisecond,
-- on a machine whose local zone is +03:00.

-- ─── 1. timestamptz everywhere ───────────────────────────────────────────────

ALTER TABLE "Document"
  ALTER COLUMN "createdAt"      TYPE TIMESTAMPTZ USING "createdAt"      AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"      TYPE TIMESTAMPTZ USING "updatedAt"      AT TIME ZONE 'UTC',
  ALTER COLUMN "agentCreatedAt" TYPE TIMESTAMPTZ USING "agentCreatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Revision"
  ALTER COLUMN "createdAt"  TYPE TIMESTAMPTZ USING "createdAt"  AT TIME ZONE 'UTC',
  ALTER COLUMN "proposedAt" TYPE TIMESTAMPTZ USING "proposedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "staleAt"    TYPE TIMESTAMPTZ USING "staleAt"    AT TIME ZONE 'UTC';

ALTER TABLE "User"
  ALTER COLUMN "createdAt"     TYPE TIMESTAMPTZ USING "createdAt"     AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"     TYPE TIMESTAMPTZ USING "updatedAt"     AT TIME ZONE 'UTC',
  ALTER COLUMN "emailVerified" TYPE TIMESTAMPTZ USING "emailVerified" AT TIME ZONE 'UTC',
  ALTER COLUMN "lastLogin"     TYPE TIMESTAMPTZ USING "lastLogin"     AT TIME ZONE 'UTC';

ALTER TABLE "AgentToken"
  ALTER COLUMN "createdAt"  TYPE TIMESTAMPTZ USING "createdAt"  AT TIME ZONE 'UTC',
  ALTER COLUMN "lastUsedAt" TYPE TIMESTAMPTZ USING "lastUsedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "expiresAt"  TYPE TIMESTAMPTZ USING "expiresAt"  AT TIME ZONE 'UTC',
  ALTER COLUMN "revokedAt"  TYPE TIMESTAMPTZ USING "revokedAt"  AT TIME ZONE 'UTC';

ALTER TABLE "ProviderCredential"
  ALTER COLUMN "createdAt"      TYPE TIMESTAMPTZ USING "createdAt"      AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"      TYPE TIMESTAMPTZ USING "updatedAt"      AT TIME ZONE 'UTC',
  ALTER COLUMN "lastUsedAt"     TYPE TIMESTAMPTZ USING "lastUsedAt"     AT TIME ZONE 'UTC',
  ALTER COLUMN "lastVerifiedAt" TYPE TIMESTAMPTZ USING "lastVerifiedAt" AT TIME ZONE 'UTC';

ALTER TABLE "DocumentCoauthors"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ USING "createdAt" AT TIME ZONE 'UTC';

-- The two NextAuth adapter tables. Their field *names* are the adapter's to
-- dictate; the column type is not, and an expiry compared against `now()` is
-- exactly the kind of value a zoneless timestamp gets wrong.
ALTER TABLE "Session"
  ALTER COLUMN "expires" TYPE TIMESTAMPTZ USING "expires" AT TIME ZONE 'UTC';

ALTER TABLE "VerificationToken"
  ALTER COLUMN "expires" TYPE TIMESTAMPTZ USING "expires" AT TIME ZONE 'UTC';

-- ─── 2. OAuth1 leftovers ─────────────────────────────────────────────────────
-- NextAuth carries these for OAuth1 providers. This app registers GitHub and
-- Google, both OAuth2, and nothing in src/ or packages/ reads either column.

ALTER TABLE "Account"
  DROP COLUMN "oauth_token",
  DROP COLUMN "oauth_token_secret";

-- ─── 3. Redundant index ──────────────────────────────────────────────────────
-- `Series_authorId_createdAt_idx` and `Series_authorId_rank_idx` both lead with
-- `authorId`, so either already answers an authorId-only lookup.
--
-- The plan also named a standalone `Document @@index([authorId])`. There is no
-- such index — in the schema or in the database — so there is nothing to drop;
-- `Document_authorId_published_idx` and `Document_authorId_rank_idx` cover it.

DROP INDEX "Series_authorId_idx";

-- ─── 4. User.role → UserRole ─────────────────────────────────────────────────
-- Converted in place rather than dropped and re-added, which is what Prisma
-- generates for this change and would discard every stored role.
--
-- The mapping is deliberately total: a value that is neither 'user' nor 'admin'
-- yields NULL, and NULL fails the column's NOT NULL. An unrecognized role
-- should stop the migration, not quietly become USER.

CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole"
  USING (
    CASE lower(btrim("role"))
      WHEN 'admin' THEN 'ADMIN'
      WHEN 'user'  THEN 'USER'
    END
  )::"UserRole";

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
