import { ApiError, userRoute } from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { discardAgentDocument } from "@/repositories/document";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

/**
 * Throw an agent-created post away (docs/plans/agent-gating.md §3.7).
 *
 * `DELETE /api/documents/[id]` would delete it too, and this route exists
 * anyway for one reason: `discardAgentDocument` refuses a post that is not
 * flagged. Discard is the destructive half of a two-button rail row, and the
 * button that deletes should not be able to delete something you wrote — so the
 * narrower action gets the narrower endpoint, and the guard sits in the same
 * transaction as the delete rather than in a read before it.
 *
 * `own` for the same reason as approve/reject — and here it is the sharpest
 * case of the three: `write` is satisfied by `collab`, which would make this a
 * way for any signed-in visitor to delete a post.
 *
 * An unflagged post is 409 rather than 404: the document exists and the caller
 * may have it, it is simply not in a state this action applies to.
 */
export const POST = userRoute<{ id: string }>(
  async (_request, { params, user }) => {
    const userPost = await requireDocument(params.id, user, "own", {
      revisions: "all",
      subtitle: "You are not authorized to discard this document",
    });

    const discarded = await discardAgentDocument(userPost.id);
    if (!discarded) {
      throw new ApiError(
        409,
        "Not an agent-created post",
        "This post was not created by an agent, so there is nothing to " +
          "discard. Delete it from the document itself if you meant to.",
      );
    }

    revalidatePath("/", "layout");
    revalidatePath("/posts", "page");
    revalidatePath("/series", "page");
    if (userPost.seriesId) {
      revalidatePath(`/series/${userPost.seriesId}`, "page");
    }

    return NextResponse.json({ data: { id: userPost.id, discarded: true } });
  },
  {
    errorLabel: "Error discarding agent-created document",
    signInMessage: "Please sign in to discard this document",
  },
);
