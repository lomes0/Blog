-- Phase 1 of docs/plans/ordering-simplification.md §8: the order arrays, added
-- alongside `rank` rather than in place of it.
--
-- Four columns, not the three the plan's §2 table names. `Project` is the one it
-- misses: a project sits in the author's root list on the shared `rank` space,
-- and it owns the order of its member series
-- (`Series @@index([projectId, rank])`). So `User.rootOrder` interleaves ids
-- from three tables — documents, series and projects — and `Project.seriesOrder`
-- exists at all.
--
-- Additive and reversible: every column defaults to the empty array, which the
-- tolerant reader (§6) reads as "no manual order, fall back to createdAt". So
-- the state between this migration and the backfill is the app's own pre-rank
-- behaviour rather than a broken view. `rank`, its indexes and its `COLLATE "C"`
-- are untouched; they go in phase 5.

ALTER TABLE "Document" ADD COLUMN "tabOrder"    TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Project"  ADD COLUMN "seriesOrder" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Series"   ADD COLUMN "postOrder"   TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User"     ADD COLUMN "rootOrder"   TEXT[] DEFAULT ARRAY[]::TEXT[];
