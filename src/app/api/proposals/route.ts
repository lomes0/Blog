import { userRoute } from "@/lib/api-utils";
import {
  findAgentCreatedDocuments,
  findPendingRenames,
} from "@/repositories/document";
import { findPendingProposalsByAuthor } from "@/repositories/revision";
import type {
  AgentCreatedPost,
  PendingProposal,
  PendingRename,
} from "@/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Everything of Claude's that is waiting on the caller, listed rather than
 * counted (docs/plans/archive/agent-gating.md §3.5, phase 4).
 *
 * This is the **dedicated pending fetch**. The alternative phase 4 was offered —
 * loosening `revisionsSelect`'s `proposedAt: null` so a proposal rides along
 * with its document — was not taken: that filter is what keeps proposals out of
 * every history read at once, and undoing it has to be got right on both arms of
 * `toCloudDocument`, one of which (`collab`) filters nothing and would hand a
 * proposal to a visitor as though it were history. A read whose only job is
 * proposals cannot leak them into a read whose job is something else.
 *
 * `userRoute` and scoped to `user.id` — never an id from the request — for the
 * same reason as `/api/proposals/count`, and because phase 2 made a proposal
 * owner-only whatever the document's publication state (§2.1). This route must
 * not be the hole in that.
 *
 * Sibling of the count route rather than a replacement for it: the count is what
 * the focus poll asks (two indexed counts, almost always zero), and this is what
 * the rail asks once the count says there is something to show.
 */
export const GET = userRoute(
  async (_request, { user }) => {
    const [rows, agentDocs, renameRows] = await Promise.all([
      findPendingProposalsByAuthor(user.id),
      findAgentCreatedDocuments(user.id),
      findPendingRenames(user.id),
    ]);

    const proposals: PendingProposal[] = rows.map((row) => ({
      id: row.id,
      version: row.version,
      documentId: row.documentId,
      documentName: row.document.title,
      documentHandle: row.document.handle,
      head: row.document.headRevisionId,
      baseRevisionId: row.baseRevisionId,
      // Non-null by the query's own `where`; the column is nullable because
      // "not a proposal" is the ordinary case for a revision row.
      proposedAt: (row.proposedAt ?? new Date()).toISOString(),
      origin: row.origin,
      summary: row.summary,
      staleAt: row.staleAt ? row.staleAt.toISOString() : null,
    }));

    const agentPosts: AgentCreatedPost[] = agentDocs.map((doc) => ({
      id: doc.id,
      name: doc.title,
      handle: doc.handle,
      agentCreatedAt: (doc.agentCreatedAt ?? new Date()).toISOString(),
      agentOrigin: doc.agentOrigin,
    }));

    // A rename is not a proposal row and not a created post: it is three
    // columns on a document the author already has (§8 of the backlog). Third
    // array rather than a flag on either of the others, because it is answered
    // by its own pair of routes and can sit alongside a proposal on the same
    // post.
    const renames: PendingRename[] = renameRows.map((doc) => ({
      id: doc.id,
      title: doc.title,
      handle: doc.handle,
      // Both non-null by the query's own `where`; the columns are nullable
      // because "no rename pending" is the ordinary state of a post.
      proposedTitle: doc.pendingTitle ?? doc.title,
      proposedAt: (doc.pendingTitleAt ?? new Date()).toISOString(),
      origin: doc.pendingTitleOrigin,
    }));

    return NextResponse.json({ data: { proposals, agentPosts, renames } });
  },
  { errorLabel: "Error listing pending agent changes" },
);
