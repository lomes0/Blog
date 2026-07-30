import { createAction } from "@reduxjs/toolkit";
import { apiClient } from "@/api";
import { rankBetween } from "@/lib/ordering";
import { createApiThunk, fail } from "./createApiThunk";

// Optimistically set a project's rank so a reorder is reflected immediately.
export const applyProjectRank = createAction<{ id: string; rank: string }>(
  "app/applyProjectRank",
);

interface ProjectCreateInput {
  title: string;
  description?: string;
}

export const loadProjects = createApiThunk(
  "app/loadProjects",
  async () => (await apiClient.projects.list()) ?? [],
);

export const createProject = createApiThunk(
  "app/createProject",
  async (arg: ProjectCreateInput) => await apiClient.projects.create(arg),
);

export const updateProject = createApiThunk(
  "app/updateProject",
  async (
    { id, data }: { id: string; data: { title?: string; description?: string } },
  ) => await apiClient.projects.update(id, data),
);

export const moveProject = createApiThunk(
  "app/moveProject",
  async (
    arg: {
      id: string;
      between?: { afterRank?: string | null; beforeRank?: string | null };
    },
    thunkAPI,
  ) => {
    // Optimistic: for a positioned move the client computes the same rank the
    // server will, so reflect it immediately. No rollback by design.
    const { afterRank, beforeRank } = arg.between ?? {};
    if (afterRank != null || beforeRank != null) {
      thunkAPI.dispatch(
        applyProjectRank({
          id: arg.id,
          rank: rankBetween(afterRank ?? null, beforeRank ?? null),
        }),
      );
    }
    const data = await apiClient.projects.move(arg.id, {
      between: arg.between,
    });
    if (!data) fail("failed to move project");
    return data;
  },
);

export const deleteProject = createApiThunk(
  "app/deleteProject",
  async (id: string) => await apiClient.projects.delete(id),
);
