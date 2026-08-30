import { apiClient } from "@/api";
import { backendFor } from "@/store/backend";
import { DocumentStorageUsage, User } from "@/types";
import { createApiThunk, fail } from "./createApiThunk";

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
      name: full.title,
      size: new Blob([JSON.stringify(full)]).size,
    });
  }
  return usage.sort((a, b) => b.size - a.size);
}

export const getStorageUsage = createApiThunk(
  "app/getStorageUsage",
  async (_, thunkAPI) => await fetchStorageUsage(thunkAPI.getState().user),
);

export const getPostThumbnail = createApiThunk(
  "app/getPostThumbnail",
  async (id: string) => {
    const data = await apiClient.thumbnails.get(id);
    if (!data) fail("thumbnail not found");
    return data;
  },
);
