import { apiClient } from "@/api";
import { backendFor } from "@/store/backend";
import { diffCatchUp } from "@/lib/changes/diff";
import type { AppState, Post } from "@/types";
import { createApiThunk } from "./createApiThunk";

/** Rows to upsert and rows proven gone — the payload `reconcile` folds in. */
interface CatchUpResult {
  changed: Post[];
  deletedIds: string[];
}

const NOTHING: CatchUpResult = { changed: [], deletedIds: [] };

/**
 * Ask what changed while the browser was not looking — Phase 0 of
 * docs/plans/archive/changes-detection.md.
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

/**
 * Fetch the documents a live event named — Phase 3 of the same plan.
 *
 * The stream carries ids and never content (§10), so acting on an event means
 * reading the row back through the ordinary authorized `PostBackend.get`. This
 * is `catchUpPosts`' second half with the diff removed: the ids arrive already
 * known, from `hooks/useChangeFeed.ts` after the coalescing window has decided
 * how few of them there really are.
 *
 * **`data` is stripped here too, and for the same reason** — §4's rule that a
 * background refresh updates list metadata only. A live event about the
 * document you are currently editing is precisely the case that rule exists
 * for: `applyPost` keeps whatever content was already loaded (`post.data ??
 * existing.data`), so omitting `data` is what stops an agent's `apply_ops`
 * announcement from replacing an open editor's content under the cursor.
 *
 * Guarded like the catch-up, minus the diff-specific one. Before `load()` has
 * settled there is nothing to reconcile *into*: `loadPosts` is on its way with
 * `setAll`, which will carry these ids anyway, so an event arriving in that
 * window is dropped rather than raced.
 *
 * Returns the rows rather than reconciling them itself. The caller dispatches
 * `reconcilePosts` — that action exists for this path (`store/app.ts`), and it
 * lets one dispatch carry the window's deletions alongside its updates.
 *
 * Origin is deliberately *not* consulted. A second tab of the same account
 * writes with `origin: "app"` exactly as this one does, and §1.2's third
 * promise is that a rename from that tab reaches this one — so filtering the
 * app's own origin out would trade a promise for a saved request. The cost is
 * that this tab re-reads the metadata of rows it just wrote itself; that is one
 * small `GET` per coalescing window, and what comes back is byte-identical to
 * what the writing thunk already applied.
 */
export const fetchChangedPosts = createApiThunk<Post[], string[]>(
  "app/fetchChangedPosts",
  async (ids, thunkAPI) => {
    const state: AppState = thunkAPI.getState();
    if (!ids.length) return [];
    if (!state.user) return [];
    if (!state.ui.initialized || state.ui.postsLoading) return [];

    const backend = backendFor(state.user);
    const fetched = await Promise.all(
      // Quietly, per row: an id can be deleted between the notification and
      // this fetch, and that costs the row rather than the batch — the delete
      // event is on its way behind it.
      ids.map((id) => backend.get(id).catch(() => undefined)),
    );
    return fetched
      .filter((post): post is Post => post !== undefined)
      .map(({ data: _data, ...metadata }) => metadata);
  },
  { title: "Couldn't load a change" },
);
