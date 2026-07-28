import { ApiError, requireUser, withApiHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { validate } from "uuid";

export const dynamic = "force-dynamic";

/**
 * Which of the caller's own posts link to this one.
 *
 * The scan is scoped to `d."authorId"`: without it the query cast every
 * revision in the table to text and returned other authors' post names and
 * handles, and made a single request read the whole revision history of every
 * account. Backlinks are only meaningful within one author's own writing
 * anyway.
 */
export const GET = withApiHandler(
  async (_request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid id");
    }
    const user = await requireUser();

    const documentId = params.id;

    // Find documents (root-level, not child tabs) whose latest revision JSON
    // contains a reference to the target document id.
    const rows = await prisma.$queryRaw<
      { id: string; name: string; handle: string | null }[]
    >`
      SELECT DISTINCT d.id, d.name, d.handle
      FROM "Revision" r
      JOIN "Document" d ON d.id = r."documentId"
      WHERE d."authorId" = ${user.id}::uuid
        AND r.data::text LIKE ${"%" + documentId + "%"}
        AND d.id != ${documentId}::uuid
        AND d."parentId" IS NULL
      ORDER BY d.name
      LIMIT 20
    `;

    return NextResponse.json({ data: rows });
  },
);
