import { createAction } from "@reduxjs/toolkit";
import { apiClient } from "@/api";
import { createApiThunk, fail } from "./createApiThunk";

/**
 * Optimistically re-home a series so a cross-container drag paints at once.
 * Its position *within* the destination comes from that container's order array
 * (docs/plans/ordering-simplification.md §4); this only says which container.
 */
export const applySeriesProject = createAction<
  { id: string; projectId: string | null }
>("app/applySeriesProject");

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

/**
 * Re-home a series into a project, or out to the root list. **Appends** there
 * (§4, decided); pair it with `setOrder` on the destination to place it.
 */
export const moveSeries = createApiThunk(
  "app/moveSeries",
  async (
    arg: { id: string; destination: { projectId?: string | null } },
    thunkAPI,
  ) => {
    thunkAPI.dispatch(
      applySeriesProject({
        id: arg.id,
        projectId: arg.destination.projectId ?? null,
      }),
    );
    const data = await apiClient.series.move(arg.id, {
      destination: arg.destination,
    });
    if (!data) fail("failed to move series");
    return data;
  },
);

export const deleteSeries = createApiThunk(
  "app/deleteSeries",
  async (id: string) => await apiClient.series.delete(id),
);
