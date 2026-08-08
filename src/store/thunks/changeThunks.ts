import { apiClient } from "@/api";
import { backendFor } from "@/store/backend";
import { diffCatchUp } from "@/lib/changes/diff";
import type { AppState, Post } from "@/types";
import { createApiThunk } from "./createApiThunk";

/** Rows to upsert and rows proven gone — the payload `reconcile` folds in. */
export interface CatchUpResult {
  changed: Post[];
  deletedIds: string[];
}

const NOTHING: CatchUpResult = { changed: [], deletedIds: [] };

/**
 * Ask what changed while the browser was not looking — Phase 0 of
 * docs/plans/changes_detection.md.
 *
 * `GET /api/documents/changes` returns every id the caller owns with its
 * `updatedAt`; the diff against the store answers create, update *and* delete
 * in one round trip (§3, §3.1). The common answer is "nothing changed", and
 * that case costs exactly one small indexed read and no further requests.
 *
 * **Guarded three ways, and each guard is a real failure without it:**
 *
 * - *Signed out.* Proposals and cloud documents are the same story here — a
 *   guest's IndexedDB has none and the route would 401. Mirrors the `user`
 *   guard in `refreshProposals`.
 * - *Not yet initialized, or a load in flight.* The poll fires on mount, which
 *   can be **before** `loadPosts` has resolved. Diffing against an empty store
 *   would call every document in the library a create and re-fetch the lot.
 *   `ui.initialized` is set by `load.fulfilled`, i.e. once posts have landed.
 *
 * The changed ids are then fetched through the ordinary `PostBackend.get`
 * rather than a new bulk endpoint — authorization already works there, and the
 * count is small by construction because the store is never far behind.
 * `data` is stripped from what comes back: §4's rule is that a background
 * refresh updates *list metadata only* and never pushes content at a document
 * that may be open. `applyPost` keeps whatever content was already loaded
 * (`post.data ?? existing.data`), so omitting it is what preserves it.
 *
 * A single id failing (deleted in the gap between the id query and the fetch,
 * most likely) drops that row rather than the batch — and quietly, per §10:
 * nothing about a background refresh should reach the user.
 */
export const catchUpPosts = createApiThunk<CatchUpResult, void>(
  "app/catchUpPosts",
  async (_arg, thunkAPI) => {
    const state: AppState = thunkAPI.getState();
    if (!state.user) return NOTHING;
    if (!state.ui.initialized || state.ui.postsLoading) return NOTHING;

    const response = await apiClient.documents.changes();
    if (!response) return NOTHING;

    const stored = state.posts.ids.map((id) => {
      const post = state.posts.entities[id];
      return { id: post.id, updatedAt: post.updatedAt };
    });
    const { changedIds, deletedIds } = diffCatchUp(stored, response.ids);
    if (!changedIds.length && !deletedIds.length) return NOTHING;

    const backend = backendFor(state.user);
    const fetched = await Promise.all(
      changedIds.map((id) => backend.get(id).catch(() => undefined)),
    );
    const changed = fetched
      .filter((post): post is Post => post !== undefined)
      .map(({ data: _data, ...metadata }) => metadata);

    return { changed, deletedIds };
  },
  { title: "Couldn't check for changes" },
);
