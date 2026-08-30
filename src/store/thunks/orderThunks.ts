import { createAction } from "@reduxjs/toolkit";
import { apiClient } from "@/api";
import { backendFor } from "@/store/backend";
import type { TreeContainer } from "@/lib/tree/model";
import type { AppState } from "@/types";
import { createApiThunk } from "./createApiThunk";

/** A container's new child order, as the surface that rendered it saw it. */
export interface OrderArg {
  container: TreeContainer;
  orderedIds: string[];
}

/**
 * Write a container's order into the store, now
 * (docs/plans/ordering-simplification.md §5).
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

/** Where a guest's reorder lands: ranks, applied to the store's posts. */
export const applyLocalRanks = createAction<{ id: string; rank: string }[]>(
  "app/applyLocalRanks",
);

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

    const state = thunkAPI.getState() as AppState;
    if (!state.user) {
      // A guest's library is IndexedDB, which has no container row to hold an
      // array (§7). The seam rewrites ranks over the same ids instead, and the
      // store takes them so the optimistic paint and the stored order agree.
      const ranked = await backendFor(state.user).reorder(orderedIds);
      thunkAPI.dispatch(applyLocalRanks(ranked));
      return { container, orderedIds };
    }

    switch (container.type) {
      case "root":
        await apiClient.users.rootOrder(rootMembers(state, orderedIds));
        break;
      case "series":
        await apiClient.series.order(container.seriesId, orderedIds);
        break;
      case "project":
        await apiClient.projects.order(container.projectId, orderedIds);
        break;
      case "tabs":
        await apiClient.documents.tabOrder(container.parentId, orderedIds);
        break;
    }
    return { container, orderedIds };
  },
  { title: "Failed to reorder" },
);
