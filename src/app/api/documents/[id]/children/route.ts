import { ApiError, requireOwner, requireUser, withApiHandler } from "@/lib/api-utils";
import { findDocument, findDocumentChildren } from "@/repositories/document";
import { NextResponse } from "next/server";
import { validate } from "uuid";

export const dynamic = "force-dynamic";

/**
 * A tabbed post's child tabs. Authenticating was not enough here — the handler
 * never checked who owned the parent, so any signed-in user could enumerate the
 * tab structure and names of anyone else's post.
 */
export const GET = withApiHandler(
  async (_request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid id");
    }
    const user = await requireUser();

    const parent = await findDocument(params.id, "all");
    if (!parent) {
      throw new ApiError(404, "Document not found");
    }
    requireOwner(
      parent.author.id,
      user,
      "You are not authorized to view this document's tabs",
    );

    const children = await findDocumentChildren(params.id);
    return NextResponse.json({ data: children });
  },
);
