-- Phase B of docs/plans/schema-organization.md: `head` becomes a real foreign
-- key, `headRevisionId`.
--
-- `head` was a client-minted UUID written *before* the revision it names
-- existed, with nothing checking that it ever came to exist. Two states were
-- therefore representable and both had been seen: a head naming a revision that
-- was never written, and a head left pointing at a revision a delete removed.
-- `findDocument` carries a repair for the second (it re-points at the newest
-- non-proposal revision); the first has no repair, because there is nothing to
-- repair towards.
--
-- Prisma's own generated SQL for this change is `DROP COLUMN "head"` +
-- `ADD COLUMN "headRevisionId"`, which discards every pointer in the table —
-- the same shape of trap the `role` conversion hit in Phase A (§6). This
-- migration adds, backfills, constrains and only then drops.
--
-- The backfill is guarded by `EXISTS` rather than copied wholesale, because a
-- `head` naming no row is exactly what the constraint is here to forbid: such a
-- document would land as NULL and be repaired on its next read. On this
-- database all 206 documents resolve, so nothing is lost — the guard is for the
-- databases this migration has not met.
--
-- No index on the new column. The only traversal from the `Revision` side is
-- the `SET NULL` Postgres performs when a head revision is deleted, and it
-- scans a table with one row per post; an index would be dead weight of exactly
-- the kind Phase A went out of its way to remove.

ALTER TABLE "Document" ADD COLUMN "headRevisionId" UUID;

UPDATE "Document" d
   SET "headRevisionId" = d."head"
 WHERE d."head" IS NOT NULL
   AND EXISTS (SELECT 1 FROM "Revision" r WHERE r."id" = d."head");

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_headRevisionId_fkey"
  FOREIGN KEY ("headRevisionId") REFERENCES "Revision"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Document" DROP COLUMN "head";
