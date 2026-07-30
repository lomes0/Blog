import { backendFor } from "@/store/backend";
import { AppState, Revision } from "@/types";
import { createApiThunk, fail } from "./createApiThunk";

const backendOf = (getState: () => AppState) => backendFor(getState().user);

/** A revision *including* its content — used to restore or diff a version. */
export const getRevision = createApiThunk(
  "app/getRevision",
  async (id: string, thunkAPI) => {
    const revision = await backendOf(thunkAPI.getState).revisions.get(id);
    if (!revision) fail("revision not found");
    return revision;
  },
);

export const createRevision = createApiThunk(
  "app/createRevision",
  async (revision: Revision, thunkAPI) =>
    await backendOf(thunkAPI.getState).revisions.create(revision),
);

export const deleteRevision = createApiThunk(
  "app/deleteRevision",
  async (arg: { id: string; documentId: string }, thunkAPI) =>
    await backendOf(thunkAPI.getState).revisions.delete(arg.id, arg.documentId),
);
