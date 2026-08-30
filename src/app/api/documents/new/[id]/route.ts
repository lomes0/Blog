import { ApiError, optionalUserRoute } from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { NextResponse } from "next/server";
import { getCachedRevision } from "@/repositories/revision";

export const dynamic = "force-dynamic";

export const GET = optionalUserRoute<{ id: string }>(
  async (request, { params, user }) => {
    const { searchParams } = new URL(request.url);
    const revisionId = searchParams.get("v");
    const cloudDocument = await requireDocument(params.id, user, "read", {
      revisions: revisionId,
      subtitle: "You are not authorized to fork this document",
    });
    if (!cloudDocument.headRevisionId) {
      throw new ApiError(404, "Document not found");
    }
    const revision = await getCachedRevision(
      revisionId ?? cloudDocument.headRevisionId,
    );
    // A pending agent proposal is not history and not the document, so it is
    // not something to fork — and `?v=` is caller-supplied, so without this a
    // published post's unapproved rewrite would be forkable by anyone
    // (docs/plans/archive/agent-gating.md §2.1). "Not found" rather than 403: the
    // revision list this id could legitimately have come from never contains it.
    if (!revision || revision.proposedAt) {
      throw new ApiError(404, "Revision not found");
    }
    return NextResponse.json({
      data: {
        id: cloudDocument.id,
        cloud: cloudDocument,
        data: revision.data,
      },
    });
  },
);
