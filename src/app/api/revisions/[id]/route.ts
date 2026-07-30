import { ApiError, optionalUserRoute, requireOwner, userRoute } from "@/lib/api-utils";
import { requireRevision } from "@/lib/access";
import { deleteRevision, findRevisionAuthorId } from "@/repositories/revision";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * A revision's content, if the caller may read the document it belongs to.
 *
 * Access follows the parent document under `read`: the author, a coauthor, or
 * anyone at all when the document is published (and not private) or open for
 * collaboration.
 */
export const GET = optionalUserRoute<{ id: string }>(
  async (_request, { params, user }) => {
    const revision = await requireRevision(
      params.id,
      user,
      "read",
      "You are not authorized to view this revision",
    );
    return NextResponse.json({ data: revision });
  },
);

export const DELETE = userRoute<{ id: string }>(
  async (_request, { params, user }) => {
    // Deletion follows the *revision's* author rather than the document's: a
    // collaborator may remove what they wrote without being able to prune the
    // owner's history.
    const authorId = await findRevisionAuthorId(params.id);
    if (!authorId) {
      throw new ApiError(404, "Document Revision not found");
    }
    requireOwner(
      authorId,
      user,
      "You are not authorized to delete this revision",
    );

    const revision = await deleteRevision(params.id);
    return NextResponse.json({
      data: {
        id: revision.id,
        documentId: revision.documentId,
      },
    });
  },
  { signInMessage: "Please sign in to delete this revision" },
);
