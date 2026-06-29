-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "rank" TEXT;

-- AlterTable
ALTER TABLE "Series" ADD COLUMN     "rank" TEXT;

-- CreateIndex
CREATE INDEX "Document_seriesId_rank_idx" ON "Document"("seriesId", "rank");

-- CreateIndex
CREATE INDEX "Document_parentId_rank_idx" ON "Document"("parentId", "rank");

-- CreateIndex
CREATE INDEX "Document_authorId_rank_idx" ON "Document"("authorId", "rank");

-- CreateIndex
CREATE INDEX "Series_authorId_rank_idx" ON "Series"("authorId", "rank");
