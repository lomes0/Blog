-- The `rank` columns hold fractional-index keys whose ordering must match
-- byte order (the JS string comparison fractional-indexing assumes). The
-- database's default collation (e.g. en_US.utf8) sorts case-insensitively, which
-- mis-orders keys with uppercase prefixes (e.g. "move to top" produces "Zz").
-- Pin the columns to the C collation so ORDER BY rank / rank indexes use byte
-- order. Existing all-lowercase keys are unaffected; their relative order holds.
ALTER TABLE "Document" ALTER COLUMN "rank" TYPE TEXT COLLATE "C";
ALTER TABLE "Series" ALTER COLUMN "rank" TYPE TEXT COLLATE "C";
