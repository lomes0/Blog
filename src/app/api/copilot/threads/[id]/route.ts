import { NextResponse } from "next/server";
import { userRoute } from "@/lib/api-utils";
import { deleteThread } from "@/repositories/copilotThread";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/copilot/threads/[id]
 *
 * No access helper: the delete is author-scoped in its own `where` clause, so
 * another user's thread is not merely refused — it is not in the statement's
 * scope at all. Deleting an id that does not exist is a no-op and reports the
 * same success, which is what makes the client's "remove from history" safe to
 * retry.
 */
export const DELETE = userRoute<{ id: string }>(
  async (_request, { params, user }) => {
    const id = await deleteThread(params.id, user.id);
    return NextResponse.json({ data: { id } });
  },
  {
    errorLabel: "Error deleting conversation",
    signInMessage: "Please sign in to delete a conversation",
  },
);
