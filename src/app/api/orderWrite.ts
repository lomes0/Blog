import { z } from "zod";
import { ApiError } from "@/lib/api-utils";
import { type OrderContainer, setOrderTx } from "@/repositories/ordering";

/**
 * The body every order endpoint takes, and the one refusal all four share
 * (docs/plans/archive/ordering-simplification.md §4).
 *
 * An order write's body is *a list of ids*, which is the shape that invites
 * checking only the first one — so the check answers for the whole array in one
 * query, against the membership of the container the caller has already been
 * proven to own (`orderMemberIds`). A body naming a row of someone else's is a
 * 400 that names it, never a silent write that adopts it into this author's
 * list.
 *
 * `.strict()`: an order write takes an array and nothing else. A position, a
 * `between` or a stray `destination` arriving here is a client that has not been
 * updated, and it should hear about that rather than have the field dropped.
 */
export const orderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).max(5000),
}).strict();

/**
 * Persist a container's order, translating the repository's refusals into the
 * 400 the caller has to act on.
 *
 * Returns the array as written — which may be longer than the one submitted: a
 * member the client did not name keeps its place rather than being dropped (see
 * `setOrder`).
 */
export async function writeOrder(
  container: OrderContainer,
  orderedIds: string[],
): Promise<string[]> {
  const result = await setOrderTx(container, orderedIds);
  if (result.ok) return result.order;

  const listed = result.ids.slice(0, 5).join(", ");
  throw new ApiError(
    400,
    "Bad Request",
    result.reason === "foreign"
      ? `Not a member of this list: ${listed}`
      : `Repeated in the order: ${listed}`,
  );
}
