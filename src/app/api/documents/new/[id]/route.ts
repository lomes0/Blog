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
    if (!cloudDocument.head) {
      throw new ApiError(404, "Document not found");
    }
    const revision = await getCachedRevision(
      revisionId ?? cloudDocument.head,
    );
    if (!revision) {
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
