import { createAsyncThunk } from "@reduxjs/toolkit";
import { backendFor } from "@/store/backend";
import { AppState, Revision } from "@/types";

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

const failure = (subtitle: string) => ({
  title: "Something went wrong",
  subtitle,
});

const backendOf = (getState: () => unknown) =>
  backendFor((getState() as AppState).user);

/** A revision *including* its content — used to restore or diff a version. */
export const getRevision = createAsyncThunk(
  "app/getRevision",
  async (id: string, thunkAPI) => {
    try {
      const revision = await backendOf(thunkAPI.getState).revisions.get(id);
      if (!revision) {
        return thunkAPI.rejectWithValue(failure("revision not found"));
      }
      return thunkAPI.fulfillWithValue(revision);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue(failure(toErrorMessage(error)));
    }
  },
);

export const createRevision = createAsyncThunk(
  "app/createRevision",
  async (revision: Revision, thunkAPI) => {
    try {
      return thunkAPI.fulfillWithValue(
        await backendOf(thunkAPI.getState).revisions.create(revision),
      );
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue(failure(toErrorMessage(error)));
    }
  },
);

export const deleteRevision = createAsyncThunk(
  "app/deleteRevision",
  async (arg: { id: string; documentId: string }, thunkAPI) => {
    try {
      return thunkAPI.fulfillWithValue(
        await backendOf(thunkAPI.getState).revisions.delete(
          arg.id,
          arg.documentId,
        ),
      );
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue(failure(toErrorMessage(error)));
    }
  },
);
