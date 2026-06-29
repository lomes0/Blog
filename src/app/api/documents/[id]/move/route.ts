import { authOptions } from "@/lib/auth";
import { ApiError, withApiHandler } from "@/lib/api-utils";
import { findDocument } from "@/repositories/document";
import { findSeriesById } from "@/repositories/series";
import { moveDocumentTx } from "@/repositories/ordering";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { validate } from "uuid";
import { z } from "zod";

export const dynamic = "force-dynamic";

// A re-home: where the document should land (its new container) and, optionally,
// the ranks of the neighbours it is dropped between. Omitting `between` appends
// it to the end of the destination container. `destination` fully specifies the
// container — it is not a partial patch.
const moveSchema = z.object({
  destination: z.object({
    seriesId: z.string().uuid().nullish(),
    parentId: z.string().uuid().nullish(),
  }),
  between: z
    .object({
      afterRank: z.string().nullish(),
      beforeRank: z.string().nullish(),
    })
    .optional(),
});

// PATCH /api/documents/[id]/move → reorder / re-home a document
export const PATCH = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid id");
    }

    const session = await getServerSession(authOptions);
    if (!session) {
      throw new ApiError(401, "Unauthorized", "Please sign in to reorder");
    }
    const { user } = session;
    if (user.disabled) {
      throw new ApiError(
        403,
        "Account Disabled",
        "Account is disabled for violating terms of service",
      );
    }

    const userPost = await findDocument(params.id);
    if (!userPost) {
      throw new ApiError(404, "Document not found");
    }
    if (user.id !== userPost.author.id) {
      throw new ApiError(
        403,
        "Unauthorized",
        "You can only reorder your own documents",
      );
    }

    const parsed = moveSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiError(
        400,
        "Bad Request",
        parsed.error.issues[0]?.message ?? "Invalid request body",
      );
    }
    const { destination, between } = parsed.data;

    // Container exclusivity: a series destination wins over a parent.
    const seriesId = destination.seriesId ?? null;
    const parentId = seriesId ? null : (destination.parentId ?? null);

    if (seriesId) {
      const targetSeries = await findSeriesById(seriesId);
      if (!targetSeries) {
        throw new ApiError(404, "Series not found");
      }
      if (targetSeries.authorId !== user.id) {
        throw new ApiError(
          403,
          "Unauthorized",
          "You can only move posts into your own series",
        );
      }
    }
    if (parentId) {
      const targetParent = await findDocument(parentId);
      if (!targetParent) {
        throw new ApiError(404, "Parent document not found");
      }
      if (targetParent.author.id !== user.id) {
        throw new ApiError(
          403,
          "Unauthorized",
          "You can only move tabs into your own document",
        );
      }
    }

    await moveDocumentTx({
      id: params.id,
      destination: { seriesId, parentId },
      between,
    });

    const data = await findDocument(params.id);

    // Revalidate the union of source and destination containers.
    revalidatePath("/");
    revalidatePath("/series");
    if (userPost.seriesId) revalidatePath(`/series/${userPost.seriesId}`);
    if (seriesId) revalidatePath(`/series/${seriesId}`);
    revalidatePath(`/view/${params.id}`);

    return NextResponse.json({ data });
  },
);
