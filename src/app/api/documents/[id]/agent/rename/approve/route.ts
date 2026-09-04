import { userRoute } from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { approvePendingRename } from "@/repositories/document";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

/**
 * Apply a rename an agent proposed (docs/plans/claude-code-backlog.md §8).
 *
 * The counterpart of `proposals/[revisionId]/approve` for the one write that
 * has no revision to approve: the title an agent asked for is sitting in
 * `pendingTitle`, and this is the author saying yes to it.
 *
 * `own` for the same reason as every other decision on this rail — renaming is
 * an act on the document, and `write` is satisfied by `collab`, which would let
 * any signed-in visitor of a collaborative post rename it.
 *
 * Idempotent, like the accept route next door: a post with nothing pending
 * answers 200 with `approved: false` rather than 404. A second click on a rail
 * button is not an error, and the state the caller wanted is the state the post
 * is in.
 */
export const POST = userRoute<{ id: string }>(
  async (_request, { params, user }) => {
    const userPost = await requireDocument(params.id, user, "own", {
      revisions: "all",
      subtitle: "You are not authorized to rename this document",
    });

    // The author comes from the document `requireDocument(…, "own")` just
    // returned, never from the request: it is the change feed's fan-out key
    // (docs/plans/archive/changes-detection.md §2.3).
    const title = await approvePendingRename(userPost.id, userPost.author.id);

    if (title !== null) {
      // The same set `PATCH /api/documents/[id]` revalidates when the author
      // renames a post themselves — this is that write, taken a day later.
      revalidatePath("/");
      revalidatePath(`/${userPost.handle || userPost.id}`);
      revalidatePath(`/view/${userPost.id}`);
      if (userPost.seriesId) {
        revalidatePath("/series");
        revalidatePath(`/series/${userPost.seriesId}`);
      }
    }

    return NextResponse.json({
      data: { id: userPost.id, approved: title !== null, title },
    });
  },
  {
    errorLabel: "Error approving this rename",
    signInMessage: "Please sign in to approve this rename",
  },
);
