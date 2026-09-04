import { userRoute } from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { rejectPendingRename } from "@/repositories/document";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Throw away a rename an agent proposed (docs/plans/claude-code-backlog.md §8).
 *
 * Nothing is lost: the post keeps the name it has, and the agent can propose
 * another. That is why this needs no confirmation in front of it, unlike
 * discarding an agent-created post, which deletes one.
 *
 * `own`, and idempotent, for the same reasons as the approve route beside it.
 */
export const POST = userRoute<{ id: string }>(
  async (_request, { params, user }) => {
    const userPost = await requireDocument(params.id, user, "own", {
      revisions: "all",
      subtitle: "You are not authorized to reject this rename",
    });

    const rejected = await rejectPendingRename(userPost.id, userPost.author.id);

    return NextResponse.json({ data: { id: userPost.id, rejected } });
  },
  {
    errorLabel: "Error rejecting this rename",
    signInMessage: "Please sign in to reject this rename",
  },
);
