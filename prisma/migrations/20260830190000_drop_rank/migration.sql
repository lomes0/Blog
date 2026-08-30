-- Phase 5 of docs/plans/ordering-simplification.md §8: `rank` goes.
--
-- After phase 4 nothing read a rank and no reorder wrote one; the columns
-- survived only because they are `NOT NULL`, so every insert still had to put
-- something there, and because a populated `rank` was what made phases 1-4
-- revertible. Neither reason outlives this migration: the create path now
-- appends to the container's order array, and the rollback from here is a
-- restore, not a revert.
--
-- Six indexes, not the four §3 lists — it misses `Project` entirely, the same
-- omission as its §2 table (§11, entry 1). Dropping the columns would take the
-- indexes with them; they are named here so the migration says what it removes.
--
-- `parentId` is the one column left without an index afterwards: its only one
-- was the composite with `rank`, and "the children of this post" is a live
-- query (`findDocumentChildren`, the tab strips). The other two Document
-- composites each still have a leading-column index — `Document_seriesId_idx`,
-- and `Document_authorId_published_idx` for `authorId`.
--
-- The `COLLATE "C"` of `20260630013820_rank_c_collation` goes with the columns
-- it applied to. That migration stays in history exactly as written: Prisma
-- checksums an applied migration and refuses one that changed.

DROP INDEX "Document_seriesId_rank_idx";
DROP INDEX "Document_parentId_rank_idx";
DROP INDEX "Document_authorId_rank_idx";
DROP INDEX "Series_authorId_rank_idx";
DROP INDEX "Series_projectId_rank_idx";
DROP INDEX "Project_authorId_rank_idx";

CREATE INDEX "Document_parentId_idx" ON "Document"("parentId");

ALTER TABLE "Document" DROP COLUMN "rank";
ALTER TABLE "Series"   DROP COLUMN "rank";
ALTER TABLE "Project"  DROP COLUMN "rank";
