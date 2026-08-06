import { userRoute } from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { acceptAgentDocument } from "@/repositories/document";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Keep an agent-created post: clear its flag (docs/plans/agent-gating.md §3.7).
 *
 * A create has no `head` to withhold and nothing to overwrite, so it lands
 * normally and is flagged instead. Accepting is the flag coming off; the post
 * itself does not change, and in particular does not become published —
 * `published` was already false and stays so.
 *
 * `own` for the same reason as approve/reject: this is an act on the document,
 * and `write` would open it to any signed-in visitor of a collab post.
 *
 * Idempotent by design. A post with no flag answers 200 with `accepted: false`
 * rather than 404: "there is nothing to accept" is the state the caller wanted,
 * and a second click on a rail button is not an error.
 */
export const POST = userRoute<{ id: string }>(
  async (_request, { params, user }) => {
    const userPost = await requireDocument(params.id, user, "own", {
      revisions: "all",
      subtitle: "You are not authorized to accept this document",
    });

    const accepted = await acceptAgentDocument(userPost.id);

    return NextResponse.json({ data: { id: userPost.id, accepted } });
  },
  {
    errorLabel: "Error accepting agent-created document",
    signInMessage: "Please sign in to accept this document",
  },
);
