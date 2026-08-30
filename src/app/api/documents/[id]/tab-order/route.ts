import { ApiError, parseBody, userRoute } from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { orderSchema, writeOrder } from "@/app/api/orderWrite";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { validate } from "uuid";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/documents/[id]/tab-order — the order of a tabbed post's child tabs
 * (docs/plans/archive/ordering-simplification.md §4).
 *
 * `own` rather than `write`: reordering a post's tabs acts on the post as an
 * object, the same way moving or renaming it does, so a collaborator with
 * content access does not get to rearrange the owner's tab strip.
 */
export const PATCH = userRoute<{ id: string }>(
  async (request, { params, user }) => {
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid id");
    }
    await requireDocument(params.id, user, "own", {
      subtitle: "You can only reorder your own tabs",
    });

    const { orderedIds } = await parseBody(request, orderSchema);
    const tabOrder = await writeOrder(
      { kind: "tabs", parentId: params.id },
      orderedIds,
    );

    revalidatePath("/");
    revalidatePath(`/view/${params.id}`);

    return NextResponse.json({ data: { tabOrder } });
  },
  { signInMessage: "Please sign in to reorder" },
);
