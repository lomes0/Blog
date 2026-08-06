-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "agentCreatedAt" TIMESTAMP(3),
ADD COLUMN     "agentOrigin" TEXT;

-- AlterTable
ALTER TABLE "Revision" ADD COLUMN     "baseRevisionId" UUID,
ADD COLUMN     "ops" JSONB,
ADD COLUMN     "origin" TEXT,
ADD COLUMN     "proposedAt" TIMESTAMP(3),
ADD COLUMN     "staleAt" TIMESTAMP(3),
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Revision_documentId_proposedAt_idx" ON "Revision"("documentId", "proposedAt");

-- At most one pending proposal per document (docs/plans/agent-gating.md §3.1).
-- Hand-written: Prisma cannot express a partial unique index, so it does not
-- appear in schema.prisma and `prisma migrate diff` will not reproduce it.
-- Enforced in the database rather than in application code so that it holds
-- against code nobody has written yet — and it is also the ON CONFLICT target
-- `upsertProposal` needs (repositories/revision.ts).
CREATE UNIQUE INDEX "revision_one_pending_per_document"
  ON "Revision" ("documentId") WHERE "proposedAt" IS NOT NULL;
