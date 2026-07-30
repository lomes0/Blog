import { createAction } from "@reduxjs/toolkit";
import { apiClient } from "@/api";
import { rankBetween } from "@/lib/ordering";
import { createApiThunk, fail } from "./createApiThunk";

// Optimistically set a series' rank (and optionally its project membership) so a
// reorder / move is reflected immediately. `projectId` is applied only when the
// key is present, so a pure reorder leaves the current membership untouched.
export const applySeriesRank = createAction<
  { id: string; rank: string; projectId?: string | null }
>(
  "app/applySeriesRank",
);

interface SeriesCreateInput {
  title: string;
  description?: string;
  /** Create it inside this project; omit for the author's root list. */
  projectId?: string | null;
}

export const loadSeries = createApiThunk(
  "app/loadSeries",
  async () => (await apiClient.series.list()) ?? [],
);

export const createSeries = createApiThunk(
  "app/createSeries",
  async (arg: SeriesCreateInput) => await apiClient.series.create(arg),
);

export const updateSeries = createApiThunk(
  "app/updateSeries",
  async (
    { id, data }: {
      id: string;
      data: { title?: string; description?: string; createdAt?: string };
    },
  ) => await apiClient.series.update(id, data),
);

export const moveSeries = createApiThunk(
  "app/moveSeries",
  async (
    arg: {
      id: string;
      destination?: { projectId?: string | null };
      between?: { afterRank?: string | null; beforeRank?: string | null };
    },
    thunkAPI,
  ) => {
    // Optimistic: for a positioned move the client computes the same rank the
    // server will, so reflect it (and any membership change) immediately. No
    // rollback by design.
    const { afterRank, beforeRank } = arg.between ?? {};
    if (afterRank != null || beforeRank != null) {
      thunkAPI.dispatch(
        applySeriesRank({
          id: arg.id,
          rank: rankBetween(afterRank ?? null, beforeRank ?? null),
          ...(arg.destination
            ? { projectId: arg.destination.projectId ?? null }
            : {}),
        }),
      );
    }
    const data = await apiClient.series.move(arg.id, {
      destination: arg.destination,
      between: arg.between,
    });
    if (!data) fail("failed to move series");
    return data;
  },
);

export const deleteSeries = createApiThunk(
  "app/deleteSeries",
  async (id: string) => await apiClient.series.delete(id),
);
