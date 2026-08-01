-- CopilotThread: a Copilot conversation, persisted per user and per workspace
-- scope. Threads lived in localStorage until now, which made them per-browser
-- rather than per-user and stranded them on one device. See
-- docs/plans/workspace-panes.md §6.3 — once the chatbox can act on the library,
-- the thread is the record of what was done.
--
-- `scope` is a plain string (a document id, or the literal "workspace" for the
-- thread started from the home pane) rather than a Document reference: a thread
-- has to outlive the post it discussed.

-- CreateTable
CREATE TABLE "CopilotThread" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Conversation',
    "current" BOOLEAN NOT NULL DEFAULT false,
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "CopilotThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CopilotThread_authorId_scope_updatedAt_idx" ON "CopilotThread"("authorId", "scope", "updatedAt");

-- AddForeignKey
ALTER TABLE "CopilotThread" ADD CONSTRAINT "CopilotThread_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
