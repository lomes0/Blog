-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "seriesId" UUID,
ADD COLUMN     "seriesOrder" INTEGER;

-- CreateTable
CREATE TABLE "Series" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "authorId" UUID NOT NULL,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Series_authorId_idx" ON "Series"("authorId");

-- CreateIndex
CREATE INDEX "Series_title_idx" ON "Series"("title");

-- CreateIndex
CREATE INDEX "Series_authorId_createdAt_idx" ON "Series"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_seriesId_idx" ON "Document"("seriesId");

-- CreateIndex
CREATE INDEX "Document_authorId_published_idx" ON "Document"("authorId", "published");

-- CreateIndex
CREATE INDEX "Document_published_type_idx" ON "Document"("published", "type");

-- CreateIndex
CREATE INDEX "Document_seriesId_seriesOrder_idx" ON "Document"("seriesId", "seriesOrder");

-- CreateIndex
CREATE INDEX "Revision_documentId_idx" ON "Revision"("documentId");

-- CreateIndex
CREATE INDEX "Revision_authorId_idx" ON "Revision"("authorId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_handle_idx" ON "User"("handle");

-- AddForeignKey
ALTER TABLE "Series" ADD CONSTRAINT "Series_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
