-- Phase D of docs/plans/schema-organization.md: the `DocumentType`
-- discriminator goes.
--
-- The enum had one member, `DOCUMENT`, and every row in the table has it. What
-- it discriminated between was posts and "directories", a second kind of node
-- that was never built — so the column answered a question the model does not
-- have, and every query that filtered on it was writing down an invariant
-- rather than narrowing anything. `parentId` is the real hierarchy: a document
-- with a parent is a tab of that post.
--
-- `Document_published_type_idx` goes with it, replaced by an index on
-- `published` alone. That is the same index for every query that used it — the
-- trailing column could not select anything, since the filter beside it always
-- matched every row.
--
-- The new index is created before the old one is dropped, so the public
-- listing's plan never has to fall back to a sequential scan, not even inside
-- this transaction.
--
-- Unlike Phase B and Phase C, Prisma's generated SQL for this one is right:
-- there is nothing to preserve, so `DROP COLUMN` is the whole of it. Written out
-- by hand regardless, because a migration that says why is worth more than one
-- that a tool could have produced.

CREATE INDEX "Document_published_idx" ON "Document"("published");

DROP INDEX "Document_published_type_idx";

ALTER TABLE "Document" DROP COLUMN "type";

DROP TYPE "DocumentType";
