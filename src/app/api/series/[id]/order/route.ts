import { ApiError, parseBody, userRoute } from "@/lib/api-utils";
import { requireOwnedSeries } from "@/lib/access";
import { orderSchema, writeOrder } from "@/app/api/orderWrite";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { validate } from "uuid";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/series/[id]/order — the order of a series' posts
 * (docs/plans/archive/ordering-simplification.md §4).
 *
 * Two checks, in this order: the series is the caller's, and every id in the
 * body is a post *of that series*. The second is what stops a body from
 * reaching sideways — a post the caller owns but which lives elsewhere is
 * refused just as a stranger's is, because either one would put an id into a
 * list it is not a member of.
 */
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

    const { orderedIds } = await parseBody(request, orderSchema);
    const postOrder = await writeOrder(
      { kind: "series", seriesId: params.id },
      orderedIds,
    );

    revalidatePath("/");
    revalidatePath("/series");
    revalidatePath(`/series/${params.id}`);

    return NextResponse.json({ data: { postOrder } });
  },
  { signInMessage: "Please sign in to reorder" },
);
