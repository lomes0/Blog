-- Phase C of docs/plans/schema-organization.md: `Document.name` becomes
-- `title`, and `background_image` goes.
--
-- Prisma's generated SQL for the rename is `DROP COLUMN "name"` +
-- `ADD COLUMN "title" TEXT NOT NULL`, which discards every title in the table —
-- and, on a table with rows and no default, does not even get that far before
-- the NOT NULL refuses it. `RENAME COLUMN` moves the data because it never
-- touches it. Same trap as Phase A's `role` and Phase B's `head` (§6); three
-- for three.
--
-- `background_image` is dropped rather than carried forward as `backgroundImage`,
-- which is what §C proposes. That line is stale: the feature was removed and its
-- bytes deleted (docs/plans/blob-storage.md §10.2), no code writes or renders
-- it, and the column is 0 non-null across all 206 documents. Renaming it would
-- only give a dead column a tidier name to be dead under. The export bundle
-- keeps reading and ignoring the field, so an old `.zip` still imports.
--
-- No index on `name` to follow: `Series` has one on its `title`, `Document`
-- never had one on `name`.

ALTER TABLE "Document" RENAME COLUMN "name" TO "title";

ALTER TABLE "Document" DROP COLUMN "background_image";
