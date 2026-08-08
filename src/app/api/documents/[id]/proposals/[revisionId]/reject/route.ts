import { ApiError, userRoute } from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { rejectProposal } from "@/repositories/revision";
import { NextResponse } from "next/server";
import { validate } from "uuid";

export const dynamic = "force-dynamic";

/**
 * Throw a pending agent proposal away (docs/plans/agent-gating.md §3.4).
 *
 * `own` for the same reason as approve: on a collab document `write` would let
 * any signed-in visitor delete work you have not looked at yet.
 *
 * The row is deleted outright — no `rejectedAt`, no retention, no extra filter
 * on every history read. The proposal was never reachable as the document, so
 * nothing is orphaned by its going: `head` never pointed at it, and the ops that
 * produced it can be regenerated.
 *
 * `rejectProposal` deletes on `{ id, documentId, proposedAt: { not: null } }`,
 * so a revision belonging to another document is a miss rather than a deletion,
 * and an ordinary history revision cannot be removed through this route at all.
 */
export const POST = userRoute<{ id: string; revisionId: string }>(
  async (_request, { params, user }) => {
    if (!validate(params.revisionId)) {
      throw new ApiError(400, "Bad Request", "Invalid revision id");
    }

    const userPost = await requireDocument(params.id, user, "own", {
      revisions: "all",
      subtitle: "You are not authorized to reject changes to this document",
    });

    // The author comes from the document `requireDocument(…, "own")` just
    // returned, never from the request: it is the change feed's fan-out key
    // (docs/plans/changes_detection.md §2.3).
    const rejected = await rejectProposal(
      userPost.id,
      params.revisionId,
      userPost.author.id,
    );
    if (!rejected) {
      throw new ApiError(
        404,
        "Proposal not found",
        "There is no pending proposal by that id on this document",
      );
    }

    return NextResponse.json({
      data: { id: userPost.id, revisionId: params.revisionId },
    });
  },
  {
    errorLabel: "Error rejecting proposal",
    signInMessage: "Please sign in to reject this change",
  },
);
