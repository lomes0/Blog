-- Manual ordering is now driven solely by `rank`; drop the legacy integer
-- ordering columns. Dropping the columns also drops the dependent
-- [seriesId, seriesOrder] index. Data in these columns was superseded by the
-- backfilled `rank` values.
DROP INDEX IF EXISTS "Document_seriesId_seriesOrder_idx";
ALTER TABLE "Document" DROP COLUMN IF EXISTS "seriesOrder";
ALTER TABLE "Document" DROP COLUMN IF EXISTS "sort_order";
