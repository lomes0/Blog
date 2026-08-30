import { ApiError, parseBody, userRoute } from "@/lib/api-utils";
import { requireOwnedProject } from "@/lib/access";
import { orderSchema, writeOrder } from "@/app/api/orderWrite";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { validate } from "uuid";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/projects/[id]/order — the order of a project's member series
 * (docs/plans/ordering-simplification.md §4).
 *
 * The fourth container. The plan's §2 table names three and misses this one,
 * which both sits in the root list and owns the order of its members — see §11.
 */
export const PATCH = userRoute<{ id: string }>(
  async (request, { params, user }) => {
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid id");
    }
    await requireOwnedProject(
      params.id,
      user,
      "You can only reorder your own projects",
    );

    const { orderedIds } = await parseBody(request, orderSchema);
    const seriesOrder = await writeOrder(
      { kind: "project", projectId: params.id },
      orderedIds,
    );

    revalidatePath("/");
    revalidatePath("/posts");

    return NextResponse.json({ data: { seriesOrder } });
  },
  { signInMessage: "Please sign in to reorder" },
);
