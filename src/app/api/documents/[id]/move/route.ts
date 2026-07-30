import { ApiError, requireOwner, userRoute } from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { findDocument } from "@/repositories/document";
import { findSeriesById } from "@/repositories/series";
import { moveDocumentTx } from "@/repositories/ordering";
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
export const PATCH = userRoute<{ id: string }>(
  async (request, { params, user }) => {
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid id");
    }

    const userPost = await requireDocument(params.id, user, "own", {
      subtitle: "You can only reorder your own documents",
    });

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
      requireOwner(
        targetSeries.authorId,
        user,
        "You can only move posts into your own series",
      );
    }
    if (parentId) {
      await requireDocument(parentId, user, "own", {
        subtitle: "You can only move tabs into your own document",
      });
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
  { signInMessage: "Please sign in to reorder" },
);
