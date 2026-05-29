import { createAsyncThunk } from "@reduxjs/toolkit";
import { revisionDB } from "@/indexeddb";
import { CloudDocumentRevision, EditorDocumentRevision } from "@/types";
import { apiClient } from "@/api";

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

export const getLocalRevision = createAsyncThunk(
  "app/getLocalRevision",
  async (id: string, thunkAPI) => {
    try {
      const revision = await revisionDB.getByID(id);
      if (!revision) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "revision not found",
        });
      }
      return thunkAPI.fulfillWithValue(revision);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const getLocalDocumentRevisions = createAsyncThunk(
  "app/getLocalDocumentRevisions",
  async (id: string, thunkAPI) => {
    try {
      const revisions = await revisionDB.getManyByKey("documentId", id);
      return thunkAPI.fulfillWithValue(revisions);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const getCloudRevision = createAsyncThunk(
  "app/getCloudRevision",
  async (id: string, thunkAPI) => {
    try {
      const data = await apiClient.revisions.get(id);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "revision not found",
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

export const createLocalRevision = createAsyncThunk(
  "app/createLocalRevision",
  async (revision: EditorDocumentRevision, thunkAPI) => {
    try {
      const id = await revisionDB.add(revision);
      if (!id) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to create revision",
        });
      }
      const { data: _data, ...rest } = revision;
      return thunkAPI.fulfillWithValue(rest);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const updateLocalRevision = createAsyncThunk(
  "app/updateLocalRevision",
  async (revision: EditorDocumentRevision, thunkAPI) => {
    try {
      await revisionDB.update(revision);
      const { data: _data, ...rest } = revision;
      return thunkAPI.fulfillWithValue(rest);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const createCloudRevision = createAsyncThunk(
  "app/createCloudRevision",
  async (revision: EditorDocumentRevision, thunkAPI) => {
    try {
      const data = await apiClient.revisions.create(revision);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to create revision",
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

export const deleteLocalRevision = createAsyncThunk(
  "app/deleteLocalRevision",
  async (arg: { id: string; documentId: string }, thunkAPI) => {
    try {
      await revisionDB.deleteByID(arg.id);
      return thunkAPI.fulfillWithValue(arg);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const deleteCloudRevision = createAsyncThunk(
  "app/deleteCloudRevision",
  async (arg: { id: string; documentId: string }, thunkAPI) => {
    try {
      const data = await apiClient.revisions.delete(arg.id);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to delete revision",
        });
      }
      return thunkAPI.fulfillWithValue(data as CloudDocumentRevision);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);
