import { optionalUserRoute } from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { NextResponse } from "next/server";
import { findRevisionThumbnail } from "../../utils";

/**
 * A document's thumbnail image.
 *
 * `read` access, so a thumbnail is public exactly when the document is — this
 * used to gate on `private` alone, which left an unpublished draft's thumbnail
 * readable by anyone who knew its id.
 */
export const GET = optionalUserRoute<{ id: string }>(
  async (_request, { params, user }) => {
    const userDocument = await requireDocument(params.id, user, "read", {
      subtitle: "You are not authorized to View this document",
    });
    const thumbnail = userDocument.head
      ? await findRevisionThumbnail(userDocument.head)
      : null;
    return NextResponse.json({ data: thumbnail });
  },
);
