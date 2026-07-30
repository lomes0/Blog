import { generateDocx } from "@/editor/utils/generateDocx";
import { ApiError, optionalUserRoute } from "@/lib/api-utils";
import { requireRevision } from "@/lib/access";

/**
 * A revision rendered as a .docx.
 *
 * This route had no authorization at all — a revision id was a bearer token for
 * a Word export of any document in the database, including unpublished drafts.
 * It now follows the same `read` rule as `GET /api/revisions/[id]`.
 */
export const GET = optionalUserRoute(async (request, { user }) => {
  const url = new URL(request.url);
  const search = url.searchParams;
  const revisionId = search.get("v");
  if (!revisionId) {
    throw new ApiError(400, "Bad Request", "Missing revision id");
  }

  const revision = await requireRevision(
    revisionId,
    user,
    "read",
    "You are not authorized to export this document",
  );

  const blob = await generateDocx(revision.data);
  return new Response(blob, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `inline; filename="${
        encodeURIComponent(revision.id)
      }.docx"`,
    },
  });
});
