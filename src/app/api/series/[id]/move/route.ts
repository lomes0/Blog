import { ApiError, userRoute } from "@/lib/api-utils";
import { requireOwnedProject, requireOwnedSeries } from "@/lib/access";
import { findSeriesById } from "@/repositories/series";
import { moveSeriesTx } from "@/repositories/ordering";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { validate } from "uuid";
import { z } from "zod";

export const dynamic = "force-dynamic";

// `destination.projectId` re-homes the series into a project (or to the root
// list when null); omit `destination` to keep its current container. `between`
// gives the neighbour ranks to drop between; omit it to append.
const moveSchema = z.object({
  destination: z
    .object({
      projectId: z.string().uuid().nullish(),
    })
    .optional(),
  between: z
    .object({
      afterRank: z.string().nullish(),
      beforeRank: z.string().nullish(),
    })
    .optional(),
});

// PATCH /api/series/[id]/move → reorder a series within the root list
export const PATCH = userRoute<{ id: string }>(
  async (request, { params, user }) => {
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid id");
    }

    await requireOwnedSeries(
      params.id,
      user,
      "You can only reorder your own series",
    );

    const parsed = moveSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiError(
        400,
        "Bad Request",
        parsed.error.issues[0]?.message ?? "Invalid request body",
      );
    }

    // Moving into a project: the destination must be the caller's own project.
    const destProjectId = parsed.data.destination?.projectId;
    if (destProjectId) {
      await requireOwnedProject(
        destProjectId,
        user,
        "You can only move series into your own projects",
      );
    }

    await moveSeriesTx({
      id: params.id,
      destination: parsed.data.destination,
      between: parsed.data.between,
    });

    revalidatePath("/");
    revalidatePath("/series");
    revalidatePath(`/series/${params.id}`);

    const updated = await findSeriesById(params.id);
    return NextResponse.json({ data: updated });
  },
  { signInMessage: "Please sign in to reorder" },
);
