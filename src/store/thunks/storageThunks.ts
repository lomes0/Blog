import { createAsyncThunk } from "@reduxjs/toolkit";
import documentDB, { revisionDB } from "@/indexeddb";
import { BackupDocument, DocumentStorageUsage } from "@/types";
import { apiClient } from "@/api";

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

export async function fetchLocalStorageUsage(): Promise<
  DocumentStorageUsage[]
> {
  const documents = await documentDB.getAll();
  const revisions = await revisionDB.getAll();
  const localStorageUsage: DocumentStorageUsage[] = [];
  documents
    .sort((a, b) => {
      const first = a.updatedAt;
      const second = b.updatedAt;
      if (!first && !second) return 0;
      if (!first) return 1;
      if (!second) return -1;
      return new Date(second).getTime() - new Date(first).getTime();
    })
    .forEach((document) => {
      const backupDocument: BackupDocument = {
        ...document,
        revisions: revisions.filter(
          (revision) => revision.documentId === document.id,
        ),
      };
      const backupDocumentSize =
        new Blob([JSON.stringify(backupDocument)]).size;
      localStorageUsage.push({
        id: document.id,
        name: document.name,
        size: backupDocumentSize,
      });
    });
  return localStorageUsage;
}

export async function fetchCloudStorageUsage(): Promise<
  DocumentStorageUsage[]
> {
  const data = await apiClient.storage.getUsage();
  if (!data) throw new Error("failed to get cloud storage usage");
  return data;
}

export const getLocalStorageUsage = createAsyncThunk(
  "app/getLocalStorageUsage",
  async (_, thunkAPI) => {
    try {
      return thunkAPI.fulfillWithValue(await fetchLocalStorageUsage());
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const getCloudStorageUsage = createAsyncThunk(
  "app/getCloudStorageUsage",
  async (_, thunkAPI) => {
    try {
      return thunkAPI.fulfillWithValue(await fetchCloudStorageUsage());
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const getCloudDocumentThumbnail = createAsyncThunk(
  "app/getCloudDocumentThumbnail",
  async (id: string, thunkAPI) => {
    try {
      const data = await apiClient.thumbnails.get(id);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "thumbnail not found",
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
