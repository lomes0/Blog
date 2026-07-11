import { createAction, createAsyncThunk } from "@reduxjs/toolkit";
import { apiClient } from "@/api";
import { rankBetween } from "@/lib/ordering";

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

// Optimistically set a project's rank so a reorder is reflected immediately.
export const applyProjectRank = createAction<{ id: string; rank: string }>(
  "app/applyProjectRank",
);

interface ProjectCreateInput {
  title: string;
  description?: string;
}

export const loadProjects = createAsyncThunk(
  "app/loadProjects",
  async (_, thunkAPI) => {
    try {
      const data = await apiClient.projects.list();
      return thunkAPI.fulfillWithValue(data ?? []);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const createProject = createAsyncThunk(
  "app/createProject",
  async (arg: ProjectCreateInput, thunkAPI) => {
    try {
      const data = await apiClient.projects.create(arg);
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const updateProject = createAsyncThunk(
  "app/updateProject",
  async (
    { id, data }: {
      id: string;
      data: { title?: string; description?: string };
    },
    thunkAPI,
  ) => {
    try {
      const result = await apiClient.projects.update(id, data);
      return thunkAPI.fulfillWithValue(result);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const moveProject = createAsyncThunk(
  "app/moveProject",
  async (
    arg: {
      id: string;
      between?: { afterRank?: string | null; beforeRank?: string | null };
    },
    thunkAPI,
  ) => {
    try {
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
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to move project",
        });
      }
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const deleteProject = createAsyncThunk(
  "app/deleteProject",
  async (id: string, thunkAPI) => {
    try {
      const data = await apiClient.projects.delete(id);
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);
