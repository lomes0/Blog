-- Which blobs each revision's content references (blob-storage plan §3).
--
-- Derived from `data`, and kept beside it so that recomputing a document's
-- reference set never has to read its documents back. See the model comment in
-- schema.prisma for the measurement that decided this.
ALTER TABLE "Revision" ADD COLUMN "blobHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill, once, in the database — every existing revision has to answer for
-- itself before the column is trusted, or a reference held only by history would
-- read as absent and its blob would become collectable.
--
-- The pattern is the one `src/lib/blobRefs.ts` scans for, spelled for Postgres.
-- Two spellings of one rule would be a drift risk if both kept running; this one
-- runs exactly once and is then dead.
UPDATE "Revision"
SET "blobHashes" = ARRAY(
  SELECT DISTINCT m[1]
  FROM regexp_matches("data"::text, '/api/blob/([0-9a-f]{64})', 'g') AS m
)
WHERE "data"::text LIKE '%/api/blob/%';
