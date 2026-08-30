import { parseBody, userRoute } from "@/lib/api-utils";
import { orderSchema, writeOrder } from "@/app/api/orderWrite";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/users/me/root-order — the order of the author's root list
 * (docs/plans/ordering-simplification.md §4).
 *
 * The one list that spans three tables: standalone documents, ungrouped series
 * and projects share it, which is why they interleave. There is no id in the
 * URL because there is no id to give — the container is the session's own user,
 * and that is the whole of the ownership check. Every id in the body is then
 * checked against what that user actually has at root.
 */
export const PATCH = userRoute(async (request, { user }) => {
  const { orderedIds } = await parseBody(request, orderSchema);

  const rootOrder = await writeOrder(
    { kind: "root", authorId: user.id },
    orderedIds,
  );

  revalidatePath("/");
  revalidatePath("/posts");

  return NextResponse.json({ data: { rootOrder } });
}, { signInMessage: "Please sign in to reorder" });
