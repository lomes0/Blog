import { createAsyncThunk } from "@reduxjs/toolkit";
import { apiClient } from "@/api";
import { backendFor } from "@/store/backend";
import { AppState, DocumentStorageUsage, User } from "@/types";

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

/**
 * How much space the session's posts occupy.
 *
 * Signed in, the server reports it directly. For guests it is measured from the
 * IndexedDB records themselves — there is no server to ask, and the serialized
 * size is what actually consumes the browser's quota.
 */
export async function fetchStorageUsage(
  user?: User | null,
): Promise<DocumentStorageUsage[]> {
  if (user) {
    const data = await apiClient.storage.getUsage();
    if (!data) throw new Error("failed to get storage usage");
    return data;
  }

  const posts = await backendFor(null).list();
  const usage: DocumentStorageUsage[] = [];
  for (const post of posts) {
    const full = await backendFor(null).get(post.id);
    if (!full) continue;
    usage.push({
      id: full.id,
      name: full.name,
      size: new Blob([JSON.stringify(full)]).size,
    });
  }
  return usage.sort((a, b) => b.size - a.size);
}

export const getStorageUsage = createAsyncThunk(
  "app/getStorageUsage",
  async (_, thunkAPI) => {
    try {
      const { user } = thunkAPI.getState() as AppState;
      return thunkAPI.fulfillWithValue(await fetchStorageUsage(user));
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const getPostThumbnail = createAsyncThunk(
  "app/getPostThumbnail",
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
