import { ApiError, userRoute } from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { findDocumentChildren } from "@/repositories/document";
import { NextResponse } from "next/server";
import { validate } from "uuid";

export const dynamic = "force-dynamic";

/**
 * A tabbed post's child tabs. Authenticating was not enough here — the handler
 * never checked who owned the parent, so any signed-in user could enumerate the
 * tab structure and names of anyone else's post.
 */
export const GET = userRoute<{ id: string }>(
  async (_request, { params, user }) => {
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid id");
    }

    await requireDocument(params.id, user, "own", {
      revisions: "all",
      subtitle: "You are not authorized to view this document's tabs",
    });

    const children = await findDocumentChildren(params.id);
    return NextResponse.json({ data: children });
  },
);
