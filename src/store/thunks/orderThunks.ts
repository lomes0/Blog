import { createAction } from "@reduxjs/toolkit";
import { backendFor } from "@/store/backend";
import type { TreeContainer } from "@/lib/tree/model";
import type { AppState } from "@/types";
import { createApiThunk } from "./createApiThunk";

/**
 * Read the session's root order from storage, for the session where storage is
 * where it lives (docs/plans/archive/ordering-simplification.md §7).
 *
 * A guest's is a record in IndexedDB and has to be fetched; a signed-in
 * author's rides on the session, so the cloud backend answers `null` and the
 * reducer leaves `user.rootOrder` alone.
 */
export const loadRootOrder = createApiThunk(
  "app/loadRootOrder",
  async (_, thunkAPI) =>
    await backendFor((thunkAPI.getState() as AppState).user).rootOrder(),
);

/** A container's new child order, as the surface that rendered it saw it. */
export interface OrderArg {
  container: TreeContainer;
  orderedIds: string[];
}

/**
 * Write a container's order into the store, now
 * (docs/plans/archive/ordering-simplification.md §5).
 *
 * Split out from {@link setOrder} rather than folded into it because a re-home
 * needs it *first*: a cross-container drag is two calls (§4), and dispatching
 * this before either request is what stops the row appearing at the end of its
 * new container for a round trip before jumping to where it was dropped.
 *
 * No rollback, by design — a failed order write settles on the next load, which
 * is the same bargain the rank-era optimistic reorder made.
 */
export const applyOrder = createAction<OrderArg>("app/applyOrder");

/**
 * The ids in a proposed root order that really are root members.
 *
 * A surface that does not render projects draws their member series inline at
 * root (`groupRootItems`), so a root reorder there can name a series that is
 * actually a project's. Those are not members of the root list, and the
 * endpoint refuses a body that names one — so they are dropped here and the
 * rest of the gesture still lands. That is the same rule `rendersProjects`
 * states: a filing the surface cannot show is left alone rather than silently
 * cleared. The server's own check stays the guarantee; this only keeps an
 * honest client from tripping it.
 */
const rootMembers = (state: AppState, ids: string[]): string[] => {
  const filed = new Set(
    state.series.filter((s) => s.projectId).map((s) => s.id),
  );
  return ids.filter((id) => !filed.has(id));
};

/**
 * Persist a container's order.
 *
 * The whole of a reorder: the caller hands over the array it already rendered
 * and one endpoint stores it verbatim. There is nothing to compute here and
 * nothing for the server to re-derive, which is the point of the phase.
 *
 * `optimistic: false` says the caller has already dispatched {@link applyOrder}
 * itself — the re-home case, which has to paint before its first request.
 */
export const setOrder = createApiThunk(
  "app/setOrder",
  async (arg: OrderArg & { optimistic?: boolean }, thunkAPI) => {
    const { container, orderedIds, optimistic = true } = arg;
    if (optimistic) thunkAPI.dispatch(applyOrder({ container, orderedIds }));

    // One call, either side of the storage seam: the array as rendered, stored
    // verbatim by whatever holds this container's order (§7 — the local library
    // is on arrays too now, so there is no guest branch left here).
    const state = thunkAPI.getState() as AppState;
    await backendFor(state.user).reorder(
      container,
      container.type === "root" ? rootMembers(state, orderedIds) : orderedIds,
    );
    return { container, orderedIds };
  },
  { title: "Failed to reorder" },
);
