import { ApiError, parseBody, userRoute } from "@/lib/api-utils";
import { requireOwnedProject, requireOwnedSeries } from "@/lib/access";
import { findSeriesById } from "@/repositories/series";
import { moveSeriesTx } from "@/repositories/ordering";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { validate } from "uuid";
import { z } from "zod";

export const dynamic = "force-dynamic";

// `destination.projectId` re-homes the series into a project, or to the root
// list when null. It is required, and the move appends
// (docs/plans/archive/ordering-simplification.md §4): a reorder within a
// container is not this endpoint any more, it is the container's own order
// write, so "destination omitted, keep the container" no longer means anything.
const moveSchema = z.object({
  destination: z.object({
    projectId: z.string().uuid().nullish(),
  }),
}).strict();

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

    const { destination } = await parseBody(request, moveSchema);

    // Moving into a project: the destination must be the caller's own project.
    if (destination.projectId) {
      await requireOwnedProject(
        destination.projectId,
        user,
        "You can only move series into your own projects",
      );
    }

    await moveSeriesTx({ id: params.id, destination });

    revalidatePath("/");
    revalidatePath("/series");
    revalidatePath(`/series/${params.id}`);

    const updated = await findSeriesById(params.id);
    return NextResponse.json({ data: updated });
  },
  { signInMessage: "Please sign in to reorder" },
);
