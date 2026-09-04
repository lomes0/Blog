-- A rename proposed by an agent, waiting on the author
-- (docs/plans/claude-code-backlog.md §8).
--
-- Three nullable columns rather than a row in `Revision`, because a proposal
-- row is content: it carries `data`, `blobHashes` and a base the approval
-- compare-and-sets against, and a save marks it stale. All three are right for
-- an edit and wrong for a rename, which touches no content and stays
-- applicable however the document moves. The columns also let one post carry a
-- pending rename *and* a pending content proposal, answered separately.
--
-- `title` keeps its meaning throughout: it is the post's name, and it changes
-- only when the author approves. Nothing reads `pendingTitle` as a title.
--
-- No index. Both readers (`findPendingRenames`, `countPendingRenames`) are
-- scoped by `authorId` first, which `Document_authorId_published_idx` already
-- leads with — the same reason `agentCreatedAt` has none.

ALTER TABLE "Document" ADD COLUMN "pendingTitle" TEXT;
ALTER TABLE "Document" ADD COLUMN "pendingTitleAt" TIMESTAMPTZ;
ALTER TABLE "Document" ADD COLUMN "pendingTitleOrigin" TEXT;
