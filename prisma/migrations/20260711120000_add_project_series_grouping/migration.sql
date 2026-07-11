-- Project: a named grouping of Series in the author's root list. A Project
-- shares the same fractional-index `rank` space as root Documents and root
-- (ungrouped) Series, so projects, loose series and standalone posts interleave.

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "authorId" UUID NOT NULL,
    "rank" TEXT NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Series gains optional membership in a Project. When set, the
-- series' `rank` is scoped to that project's members; when null it lives at root.
ALTER TABLE "Series" ADD COLUMN "projectId" UUID;

-- CreateIndex
CREATE INDEX "Project_authorId_idx" ON "Project"("authorId");

-- CreateIndex
CREATE INDEX "Project_authorId_rank_idx" ON "Project"("authorId", "rank");

-- CreateIndex
CREATE INDEX "Series_projectId_idx" ON "Series"("projectId");

-- CreateIndex
CREATE INDEX "Series_projectId_rank_idx" ON "Series"("projectId", "rank");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Series" ADD CONSTRAINT "Series_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Pin `rank` to the C collation (byte order) so it matches the ordering that
-- fractional-indexing assumes and that Document/Series ranks already use. See
-- 20260630013820_rank_c_collation.
ALTER TABLE "Project" ALTER COLUMN "rank" TYPE TEXT COLLATE "C";
