import { ApiError, userRoute } from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { approveProposal } from "@/repositories/revision";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { validate } from "uuid";

export const dynamic = "force-dynamic";

/**
 * Make a pending agent proposal the document (docs/plans/agent-gating.md §3.4).
 *
 * **`own`, not `write`.** `collab` satisfies `write` — "anyone holding the link
 * may edit" (`lib/access.ts`) — so on a collab document `write` would let any
 * signed-in visitor commit Claude's unreviewed work into `head`. Approving is an
 * act *on* the document rather than an edit *of* its content, which is the line
 * `own` already draws for rename, delete and move.
 *
 * The document is resolved before the revision id is used, and `approveProposal`
 * then matches on `{ id: revisionId, documentId }` — a revision id is not a
 * bearer token, and one belonging to another document must not be approvable
 * through a document you happen to own.
 *
 * Everything else is phase 1's transaction: the compare-and-set on
 * `Document.head` uses the proposal's `baseRevisionId`, so a save made after the
 * proposal was written makes the guard miss and this answers 409 rather than
 * quietly discarding that save.
 */
export const POST = userRoute<{ id: string; revisionId: string }>(
  async (_request, { params, user }) => {
    if (!validate(params.revisionId)) {
      throw new ApiError(400, "Bad Request", "Invalid revision id");
    }

    // `revisions: "all"` keeps this read off `findDocument`'s head-repair write
    // path, and leaves `head` as stored rather than as repaired.
    const userPost = await requireDocument(params.id, user, "own", {
      revisions: "all",
      subtitle: "You are not authorized to approve changes to this document",
    });

    // The document's own id, never `params.id` — that segment may be a handle,
    // and the proposal is keyed by `documentId`.
    const result = await approveProposal(userPost.id, params.revisionId);

    if (!result.ok) {
      if (result.reason === "not-found") {
        // Approving twice. The first call cleared `proposedAt` and moved `head`,
        // so there is no longer a pending row to find — but if `head` is already
        // this revision the caller's intent is satisfied, and a second click on
        // a rail button should not read as an error. Anything else genuinely is
        // not there: no such revision, or one belonging to another document.
        if (userPost.head === params.revisionId) {
          return NextResponse.json({
            data: {
              id: userPost.id,
              head: params.revisionId,
              approved: false,
            },
          });
        }
        throw new ApiError(
          404,
          "Proposal not found",
          "There is no pending proposal by that id on this document",
        );
      }

      if (result.reason === "stale") {
        throw new ApiError(
          409,
          "This proposal is out of date",
          "The document changed after this was proposed. Ask Claude again " +
            "against the current content.",
        );
      }

      // "conflict": the compare-and-set on `head` missed, so the document moved
      // off the base this proposal was built on — a save of your own, in another
      // tab. Nothing was overwritten.
      throw new ApiError(
        409,
        "Saved somewhere else first",
        "This document changed after the proposal was written, so approving " +
          "it would have overwritten that change. Nothing was applied.",
      );
    }

    revalidatePath("/");
    revalidatePath(`/${userPost.handle || userPost.id}`);
    revalidatePath(`/view/${userPost.id}`);
    if (userPost.seriesId) {
      revalidatePath("/series");
      revalidatePath(`/series/${userPost.seriesId}`);
    }

    return NextResponse.json({
      data: { id: userPost.id, head: result.head, approved: true },
    });
  },
  {
    errorLabel: "Error approving proposal",
    signInMessage: "Please sign in to approve this change",
  },
);
