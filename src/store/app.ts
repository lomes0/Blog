import {
  createEntityAdapter,
  createSlice,
  EntityState,
  PayloadAction,
} from "@reduxjs/toolkit";
import {
  Announcement,
  AppState,
  DEFAULT_PANE_RATIO,
  PendingProposal,
  Post,
  SaveStatus,
  Series,
  SidebarView,
} from "../types";

// ── Domain thunks (split into separate files for maintainability) ────────────
import { loadSession } from "./thunks/sessionThunks";
import {
  applyPostContainer,
  createPost,
  deletePost,
  duplicatePost,
  forkPost,
  getPost,
  loadPosts,
  movePost,
  updatePost,
} from "./thunks/postThunks";
import {
  createRevision,
  deleteRevision,
  getRevision,
} from "./thunks/revisionThunks";
import {
  applySeriesProject,
  createSeries,
  deleteSeries,
  loadSeries,
  moveSeries,
  updateSeries,
} from "./thunks/seriesThunks";
import {
  createProject,
  deleteProject,
  loadProjects,
  updateProject,
} from "./thunks/projectThunks";
import {
  applyOrder,
  loadRootOrder,
  setOrder,
} from "./thunks/orderThunks";
import {
  acceptAgentPost,
  approveProposal,
  discardAgentPost,
  refreshProposals,
  rejectProposal,
} from "./thunks/proposalThunks";
import { catchUpPosts, fetchChangedPosts } from "./thunks/changeThunks";
import { alert, updateUser } from "./thunks/userThunks";
import { importGuestDrafts } from "./thunks/importGuestDrafts";
import { createApiThunk, type Failure } from "./thunks/createApiThunk";
import { paneShowing, workspaceReducers } from "./workspaceReducers";
import { containerFromPost, type TreeContainer } from "@/lib/tree/model";

// Re-exported so `@/store/app` remains the one import path for the slice's
// public surface; `selectPaneShowingDoc` reads it from here.
export { paneShowing };

export const postsAdapter = createEntityAdapter<Post>();

/** Insert a new post at the front of ids[] so it appears first in the list. */
function prependPost(state: EntityState<Post, string>, post: Post) {
  postsAdapter.addOne(state, post);
  const idx = state.ids.indexOf(post.id);
  if (idx > 0) {
    state.ids.splice(idx, 1);
    state.ids.unshift(post.id);
  }
}

/**
 * Apply an authoritative post to the store: upsert it and keep `series.posts` in
 * sync with any membership change. Shared by create, update and move.
 *
 * A list-view post carries no `data`; merging rather than replacing keeps content
 * already loaded for the editor from being dropped by a background refresh.
 */
function applyPost(
  posts: EntityState<Post, string>,
  series: Series[],
  post: Post,
) {
  const existing = posts.entities[post.id];
  const previousSeriesId = existing?.seriesId;
  if (!existing) {
    prependPost(posts, post);
  } else {
    // A list payload carries only the newest revision (see `revisionsSelect`),
    // so it must not replace a fuller history the detail route already loaded —
    // otherwise a background refresh would collapse the revisions panel to one
    // entry. Revision *deletion* has its own reducer and does not come through
    // here, so keeping the longer list cannot strand a removed revision.
    const incoming = post.revisions;
    const kept = existing.revisions;
    Object.assign(existing, post, {
      data: post.data ?? existing.data,
      revisions: incoming && incoming.length >= (kept?.length ?? 0)
        ? incoming
        : kept,
    });
  }

  if (previousSeriesId && previousSeriesId !== post.seriesId) {
    const oldSeries = series.find((s) => s.id === previousSeriesId);
    if (oldSeries) {
      oldSeries.posts = oldSeries.posts.filter((p) => p.id !== post.id);
    }
  }
  if (post.seriesId) {
    const target = series.find((s) => s.id === post.seriesId);
    if (target) {
      const idx = target.posts.findIndex((p) => p.id === post.id);
      if (idx === -1) target.posts.push(post);
      else target.posts[idx] = post;
    }
  }
}

/**
 * Sort key for `posts.ids`: newest first.
 *
 * `postsAdapter` is created without a `sortComparer`, so list order is whatever
 * `ids[]` holds and every writer maintains it by hand — `loadPosts` pre-sorts
 * before `setAll`, `prependPost` splices to the front, and `reconcile` re-sorts
 * after a background upsert.
 */
const updatedAtMs = (post: Post) => new Date(post.updatedAt).getTime();

/** Drop a post from the store and from any series that lists it. */
// ── Order arrays in the store (docs/plans/ordering-simplification.md §6) ────
//
// The server maintains each container's array explicitly on every write, and
// the store maintains the same arrays for the writes it applies optimistically.
// There is nothing to derive them from: the array *is* the order, so a create /
// delete / re-home edits it directly rather than recomputing it (which is what
// `store/orderSync.ts` did, and why it is gone).
//
// Drift is not an error — the tolerant reader shows a row the array has not
// heard of last, which is exactly where the server appended it — so these are
// about what the user sees *now*, before the next load settles it.

/** The container a post lives in, as the order arrays address containers. */
const postContainer = (post: {
  seriesId?: string | null;
  parentId?: string | null;
}): TreeContainer => containerFromPost(post);

/** The stored order of a container, or null when the store has no such row. */
function readStoreOrder(
  state: AppState,
  container: TreeContainer,
): string[] | null {
  switch (container.type) {
    case "root":
      // A guest's root list is `guestRootOrder`, the in-memory half of the
      // IndexedDB record (§7). The branch is on which storage the session uses,
      // never on whether an array happens to be empty: a signed-in author with
      // an empty `rootOrder` genuinely has no manual order.
      return state.user ? (state.user.rootOrder ?? []) : state.guestRootOrder;
    case "series":
      return state.series.find((s) => s.id === container.seriesId)?.postOrder ??
        null;
    case "project":
      return state.projects.find((p) => p.id === container.projectId)
        ?.seriesOrder ?? null;
    case "tabs":
      return state.posts.entities[container.parentId]?.tabOrder ?? null;
  }
}

function writeStoreOrder(
  state: AppState,
  container: TreeContainer,
  ids: string[],
): void {
  switch (container.type) {
    case "root":
      if (state.user) state.user.rootOrder = ids;
      else state.guestRootOrder = ids;
      return;
    case "series": {
      const series = state.series.find((s) => s.id === container.seriesId);
      if (series) series.postOrder = ids;
      return;
    }
    case "project": {
      const project = state.projects.find((p) => p.id === container.projectId);
      if (project) project.seriesOrder = ids;
      return;
    }
    case "tabs": {
      const parent = state.posts.entities[container.parentId];
      if (parent) parent.tabOrder = ids;
      return;
    }
  }
}

/** Put `id` into a container's array if it is not already there. */
function addToStoreOrder(
  state: AppState,
  container: TreeContainer,
  id: string,
  at: "start" | "end" = "end",
): void {
  const current = readStoreOrder(state, container);
  if (current === null || current.includes(id)) return;
  writeStoreOrder(
    state,
    container,
    at === "start" ? [id, ...current] : [...current, id],
  );
}

/** Drop `id` from a container's array. */
function removeFromStoreOrder(
  state: AppState,
  container: TreeContainer,
  id: string,
): void {
  const current = readStoreOrder(state, container);
  if (current === null || !current.includes(id)) return;
  writeStoreOrder(state, container, current.filter((each) => each !== id));
}

/** Drop `id` from every array that could be naming it. */
function forgetFromOrders(state: AppState, id: string): void {
  if (state.user?.rootOrder?.includes(id)) {
    state.user.rootOrder = state.user.rootOrder.filter((each) => each !== id);
  }
  if (state.guestRootOrder.includes(id)) {
    state.guestRootOrder = state.guestRootOrder.filter((each) => each !== id);
  }
  for (const series of state.series) {
    if (series.postOrder?.includes(id)) {
      series.postOrder = series.postOrder.filter((each) => each !== id);
    }
  }
  for (const project of state.projects) {
    if (project.seriesOrder?.includes(id)) {
      project.seriesOrder = project.seriesOrder.filter((each) => each !== id);
    }
  }
  for (const post of Object.values(state.posts.entities)) {
    if (post?.tabOrder?.includes(id)) {
      post.tabOrder = post.tabOrder.filter((each) => each !== id);
    }
  }
}

function removePost(state: AppState, id: string) {
  postsAdapter.removeOne(state.posts, id);
  for (const series of state.series) {
    if (series.posts?.length) {
      series.posts = series.posts.filter((post) => post.id !== id);
    }
  }
  // A document that is gone cannot still be waiting on review. The proposal
  // went with it server-side (the revision cascades), so leaving the flags
  // behind would keep a badge counting work nobody can reach — and once
  // `agentPostIds` answers per row, a stale key outlives the row that would
  // have made it visible. Both helpers are no-ops when the id is not flagged,
  // which is what lets the discard path call one of them first.
  forgetProposal(state, id);
  forgetAgentPost(state, id);
  forgetFromOrders(state, id);
}

/** What a background catch-up has learned: rows to upsert, rows proven gone. */
export interface ReconcilePayload {
  changed: Post[];
  deletedIds: string[];
}

/**
 * Fold a catch-up result into the store — docs/plans/archive/changes-detection.md §4.
 *
 * Reached two ways, which is why it is a function rather than a reducer body:
 * the `reconcilePosts` action (what the SSE phase will dispatch per event) and
 * `catchUpPosts.fulfilled` (the poll's whole-set answer). Both mean the same
 * thing and must not drift apart.
 *
 * Deliberately **not** `setAll`, which is what `loadPosts` uses: that discards
 * every entity the response happens to omit and churns every row in a list the
 * user may be reading. Deliberately not a raw `upsertMany` either — `applyPost`
 * is what keeps `series[].posts` in sync and what preserves `data` and a longer
 * `revisions` array, so an open document is not stripped of its content by a
 * background refresh.
 *
 * The re-sort is load-bearing rather than tidiness: with no `sortComparer` on
 * the adapter, `applyPost` leaves a touched post exactly where it was and
 * `prependPost` puts a new one at the very front regardless of its date. Only
 * an explicit sort lands `ids[]` in the same newest-first order `loadPosts`
 * establishes. Skipped when nothing was upserted, since a removal cannot
 * reorder what is left.
 */
function reconcile(state: AppState, payload: ReconcilePayload) {
  for (const post of payload.changed) {
    applyPost(state.posts, state.series, post);
  }
  for (const id of payload.deletedIds) {
    removePost(state, id);
  }
  if (!payload.changed.length) return;
  const { entities } = state.posts;
  state.posts.ids.sort((a, b) =>
    updatedAtMs(entities[b]) - updatedAtMs(entities[a])
  );
}

/**
 * Drop a document's pending proposal and keep the badge count honest.
 *
 * The count is decremented rather than recomputed because it is what the *poll*
 * last reported, and the next poll is up to a window focus away: leaving it
 * alone would keep a badge on a document whose proposal is already gone.
 */
function forgetProposal(state: AppState, documentId: string) {
  if (!state.ui.proposals.byDocId[documentId]) return;
  delete state.ui.proposals.byDocId[documentId];
  const { count } = state.ui.proposals;
  count.proposals = Math.max(0, count.proposals - 1);
  count.total = count.proposals + count.agentPosts;
}

/**
 * The same, for an agent-created post that has been accepted or discarded.
 *
 * The keyed mirror is dropped in the same breath as the array entry: the two
 * are one fact in two shapes, and a reader that found them disagreeing would
 * have no way to tell which one is the truth.
 */
function forgetAgentPost(state: AppState, id: string) {
  const before = state.ui.proposals.agentPosts.length;
  state.ui.proposals.agentPosts = state.ui.proposals.agentPosts.filter(
    (post) => post.id !== id,
  );
  delete state.ui.proposals.agentPostIds[id];
  if (state.ui.proposals.agentPosts.length === before) return;
  const { count } = state.ui.proposals;
  count.agentPosts = Math.max(0, count.agentPosts - 1);
  count.total = count.proposals + count.agentPosts;
}

/** Push a thunk's `rejectWithValue` payload onto the announcement queue. */
const announceFailure = (state: AppState, payload: unknown) => {
  state.ui.announcements.push({ message: payload as Failure });
};

const initialState: AppState = {
  posts: postsAdapter.getInitialState(),
  series: [],
  projects: [],
  guestRootOrder: [],
  ui: {
    announcements: [],
    alerts: [],
    initialized: false,
    postsLoading: false,
    saveStatus: {},
    drawer: false,
    page: 1,
    diff: {},
    attachmentPreview: null,
    attachmentModified: null,
    workspace: {
      panes: [],
      focusedPaneId: null,
      splitRatio: DEFAULT_PANE_RATIO,
      maximizedPaneId: null,
    },
    workspaceHydrated: false,
    workspaceKey: null,
    workspaceRestoreFailed: false,
    workspaceProvisional: false,
    sidebarView: "explorer",
    proposals: {
      byDocId: {},
      agentPosts: [],
      agentPostIds: {},
      count: { proposals: 0, agentPosts: 0, total: 0 },
      status: "idle",
      error: null,
      loaded: false,
    },
  },
};

/**
 * Bring the store up on first render.
 *
 * The session decides everything downstream — which backend `loadPosts` reads
 * from, and whether series/projects exist at all — so it is awaited first. Guest
 * drafts left over from before sign-in are imported before the load so they show
 * up in the same pass.
 */
export const load = createApiThunk("app/load", async (_, thunkAPI) => {
  await thunkAPI.dispatch(loadSession());
  await thunkAPI.dispatch(importGuestDrafts());
  await thunkAPI.dispatch(loadPosts());
  // A guest's root order lives in IndexedDB rather than on the session, so it
  // is a read of its own (docs/plans/ordering-simplification.md §7). A no-op
  // when signed in — the cloud backend answers null.
  await thunkAPI.dispatch(loadRootOrder());

  // Series must settle after posts so `series.posts` wins for shared entries.
  // Projects only group series, so they need not block.
  const { user } = thunkAPI.getState();
  if (user) {
    await thunkAPI.dispatch(loadSeries());
    thunkAPI.dispatch(loadProjects());
  }
});

// ── Slice ────────────────────────────────────────────────────────────────────
export const appSlice = createSlice({
  name: "app",
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<AppState["user"]>) {
      state.user = action.payload;
    },
    announce: (state, action: PayloadAction<Announcement>) => {
      state.ui.announcements.push(action.payload);
    },
    clearAnnouncement: (state) => {
      state.ui.announcements.shift();
    },
    clearAlert: (state) => {
      state.ui.alerts.shift();
    },
    setSaveStatus: (
      state,
      action: PayloadAction<{ id: string; status: SaveStatus }>,
    ) => {
      const { id, status } = action.payload;
      if (status === "idle") delete state.ui.saveStatus[id];
      else state.ui.saveStatus[id] = status;
    },
    toggleDrawer: (state, action: PayloadAction<boolean | undefined>) => {
      if (action.payload !== undefined) state.ui.drawer = action.payload;
      else state.ui.drawer = !state.ui.drawer;
    },
    setPage: (state, action: PayloadAction<number>) => {
      state.ui.page = action.payload;
    },
    setDiffRevisions: (
      state,
      action: PayloadAction<{ old?: string; new?: string }>,
    ) => {
      // `rejectedHunks` is dropped rather than merged: hunk ids are only
      // meaningful against the pair of revisions that produced them, so
      // carrying a decision into a new comparison would name blocks in a
      // document nobody was looking at.
      state.ui.diff = { ...state.ui.diff, ...action.payload };
      delete state.ui.diff.rejectedHunks;
    },

    /**
     * Which hunks of the proposal under review the author has refused (§7).
     *
     * Global for the same reason `diff` itself is: the list that collects the
     * decision (`Diff/ProposalReview`) and the button that acts on it
     * (`EditDocument/AgentChangeBar`) are siblings, not parent and child.
     */
    setRejectedHunks: (state, action: PayloadAction<string[]>) => {
      state.ui.diff.rejectedHunks = action.payload;
    },

    /**
     * Upsert the named posts, drop the ones proven gone, touch nothing else.
     *
     * The store-side half of the change feed (docs/plans/archive/changes-detection.md
     * §4). Kept as a plain action as well as a thunk case because Phase 3's
     * stream reconciles *per event* with ids it already holds, and that path
     * has no fetch to hang a `fulfilled` case on.
     */
    reconcilePosts: (state, action: PayloadAction<ReconcilePayload>) => {
      reconcile(state, action.payload);
    },

    ...workspaceReducers,

    openAttachmentPreview: (
      state,
      action: PayloadAction<{
        nodeKey?: string | null;
        url: string;
        filename: string;
        mimetype: string;
      }>,
    ) => {
      state.ui.attachmentPreview = {
        open: true,
        nodeKey: action.payload.nodeKey ?? null,
        url: action.payload.url,
        filename: action.payload.filename,
        mimetype: action.payload.mimetype,
      };
    },
    closeAttachmentPreview: (state) => {
      state.ui.attachmentPreview = null;
    },
    notifyAttachmentModified: (
      state,
      action: PayloadAction<{ url: string }>,
    ) => {
      state.ui.attachmentModified = {
        url: action.payload.url,
        timestamp: Date.now(),
      };
    },
    clearAttachmentModified: (state) => {
      state.ui.attachmentModified = null;
    },
    setSidebarView: (state, action: PayloadAction<SidebarView>) => {
      state.ui.sidebarView = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // ── Session ──
      .addCase(loadSession.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(load.fulfilled, (state) => {
        state.ui.initialized = true;
      })
      // ── Posts ──
      .addCase(loadPosts.pending, (state) => {
        state.ui.postsLoading = true;
      })
      .addCase(loadPosts.fulfilled, (state, action) => {
        state.ui.postsLoading = false;
        const sorted = [...action.payload].sort((a, b) =>
          updatedAtMs(b) - updatedAtMs(a)
        );
        postsAdapter.setAll(state.posts, sorted);
      })
      .addCase(loadPosts.rejected, (state, action) => {
        state.ui.postsLoading = false;
        announceFailure(state, action.payload);
      })
      // Quiet by construction: no `.rejected` case, because a background
      // refresh that fails is not news (§10) — the next focus asks again.
      .addCase(catchUpPosts.fulfilled, (state, action) => {
        reconcile(state, action.payload);
      })
      // The live stream's half of the same fold, and quiet for the same reason.
      // Only the shape of the question differs: an event names its ids, so
      // there is nothing to diff — and nothing to delete either, since a
      // deletion has no row to fetch and reaches the store through the
      // `reconcilePosts` action instead.
      .addCase(fetchChangedPosts.fulfilled, (state, action) => {
        reconcile(state, { changed: action.payload, deletedIds: [] });
      })
      .addCase(getPost.fulfilled, (state, action) => {
        applyPost(state.posts, state.series, action.payload);
      })
      .addCase(createPost.fulfilled, (state, action) => {
        applyPost(state.posts, state.series, action.payload);
        // The container's array gains the id, at the end the create asked for —
        // the store's half of what `createDocument` does server-side and
        // `localBackend.create` does in IndexedDB (§6, "Create"). Without it a
        // `placement: "start"` post reads *last* until the next load, because
        // the tolerant reader appends what the array has not heard of.
        addToStoreOrder(
          state,
          postContainer(action.payload),
          action.payload.id,
          action.meta.arg.placement === "start" ? "start" : "end",
        );
      })
      .addCase(createPost.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(updatePost.fulfilled, (state, action) => {
        applyPost(state.posts, state.series, action.payload);
      })
      .addCase(updatePost.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(duplicatePost.fulfilled, (state, action) => {
        applyPost(state.posts, state.series, action.payload);
        // A copy is appended, as both backends append it (§6, "Create").
        addToStoreOrder(
          state,
          postContainer(action.payload),
          action.payload.id,
        );
      })
      .addCase(duplicatePost.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(forkPost.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(deletePost.fulfilled, (state, action) => {
        removePost(state, action.payload);
        delete state.ui.saveStatus[action.payload];
      })
      .addCase(deletePost.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(applyPostContainer, (state, action) => {
        const { id, seriesId, parentId } = action.payload;
        const post = state.posts.entities[id];
        if (!post) return;
        // The array it is leaving loses the id; the one it joins gains it at
        // the end, which is where the server appends it (§4). A drop at a slot
        // has already dispatched `applyOrder` for the destination, so the add
        // is a no-op there.
        removeFromStoreOrder(state, postContainer(post), id);
        post.seriesId = seriesId;
        post.parentId = parentId;
        addToStoreOrder(state, postContainer(post), id);
        // The series copies are a second view of the same rows: a post that
        // left a series must leave that series' `posts`, or the grouping keeps
        // drawing it there.
        for (const series of state.series) {
          if (series.id === seriesId) {
            // A copy rather than the entity itself: `series.posts` is a second
            // view of the same row, and `applyPost` replaces it wholesale when
            // the server answers.
            if (!series.posts.some((p) => p.id === id)) {
              series.posts.push({ ...post });
            }
          } else if (series.posts?.length) {
            series.posts = series.posts.filter((p) => p.id !== id);
          }
        }
      })
      .addCase(movePost.fulfilled, (state, action) => {
        applyPost(state.posts, state.series, action.payload);
      })
      .addCase(movePost.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(importGuestDrafts.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      // ── Revisions ──
      .addCase(createRevision.fulfilled, (state, action) => {
        const revision = action.payload;
        const post = state.posts.entities[revision.documentId];
        if (!post) return;
        if (!post.revisions) post.revisions = [];
        // Autosaves fold into one revision, so a known id means that revision
        // advanced — refresh it in place rather than skipping, or the revisions
        // panel would keep showing the timestamp the stretch started at.
        const index = post.revisions.findIndex((r) => r.id === revision.id);
        if (index === -1) post.revisions.unshift(revision);
        else post.revisions[index] = revision;
      })
      .addCase(createRevision.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(getRevision.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(deleteRevision.fulfilled, (state, action) => {
        const { id, documentId } = action.payload;
        const post = state.posts.entities[documentId];
        if (!post?.revisions) return;
        post.revisions = post.revisions.filter((r) => r.id !== id);
      })
      .addCase(deleteRevision.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      // ── Agent proposals (docs/plans/archive/agent-gating.md §3.5) ──
      //
      // No `announceFailure` on the poll, unlike almost everything else here: it
      // runs on every window focus, and a server that is down would stack a
      // snackbar each time you came back to the tab. The failure is recorded on
      // the slice and the rail renders it — loud where someone is looking, quiet
      // where nobody asked. The four *actions* below do announce, because a
      // button that did nothing and said nothing is the worse failure.
      .addCase(refreshProposals.pending, (state) => {
        state.ui.proposals.status = "loading";
      })
      .addCase(refreshProposals.fulfilled, (state, action) => {
        const { count, proposals, agentPosts } = action.payload;
        const byDocId: Record<string, PendingProposal> = {};
        for (const proposal of proposals) {
          byDocId[proposal.documentId] = proposal;
        }
        // Both shapes are rebuilt from the same listing rather than patched, so
        // a document whose proposal was approved elsewhere disappears from
        // every reader in one assignment.
        const agentPostIds: Record<string, true> = {};
        for (const post of agentPosts) {
          agentPostIds[post.id] = true;
        }
        state.ui.proposals.byDocId = byDocId;
        state.ui.proposals.agentPosts = agentPosts;
        state.ui.proposals.agentPostIds = agentPostIds;
        state.ui.proposals.count = count;
        state.ui.proposals.status = "idle";
        state.ui.proposals.error = null;
        state.ui.proposals.loaded = true;
      })
      .addCase(refreshProposals.rejected, (state, action) => {
        state.ui.proposals.status = "error";
        state.ui.proposals.error = action.payload?.subtitle ??
          "Could not reach the server.";
      })
      .addCase(approveProposal.fulfilled, (state, action) => {
        const { documentId, head } = action.payload;
        forgetProposal(state, documentId);
        // The document's `head` moved. Reflect it so the open tab's next save
        // carries the right compare-and-set precondition rather than 409ing
        // against the head it was loaded at.
        const post = state.posts.entities[documentId];
        if (post && head) post.head = head;
      })
      .addCase(approveProposal.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(rejectProposal.fulfilled, (state, action) => {
        forgetProposal(state, action.payload.documentId);
      })
      .addCase(rejectProposal.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(acceptAgentPost.fulfilled, (state, action) => {
        forgetAgentPost(state, action.payload);
      })
      .addCase(acceptAgentPost.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(discardAgentPost.fulfilled, (state, action) => {
        forgetAgentPost(state, action.payload);
        removePost(state, action.payload);
      })
      .addCase(discardAgentPost.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      // ── User ──
      .addCase(updateUser.fulfilled, (state, action) => {
        // `PATCH /api/users/[id]` answers with the profile fields it may write,
        // and `rootOrder` is not one of them — it is the author's root list
        // (docs/plans/ordering-simplification.md §2), which a rename has no
        // opinion about. Carry it across, or changing a handle would drop the
        // whole sidebar back to createdAt order until the next reload.
        const rootOrder = action.payload.rootOrder ?? state.user?.rootOrder;
        state.user = { ...action.payload, rootOrder };
      })
      .addCase(updateUser.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(alert.pending, (state, action) => {
        state.ui.alerts.push(action.meta.arg);
      })
      .addCase(alert.fulfilled, (state) => {
        state.ui.alerts.shift();
      })
      .addCase(alert.rejected, (state, action) => {
        state.ui.alerts.shift();
        announceFailure(state, action.payload);
      })
      // ── Series ──
      .addCase(loadSeries.fulfilled, (state, action) => {
        state.series = action.payload || [];
      })
      .addCase(loadSeries.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(createSeries.fulfilled, (state, action) => {
        if (!action.payload) return;
        state.series.unshift(action.payload);
        // The container it was born in gains the id — its project when it has
        // one, otherwise the root list (§6, "Create").
        addToStoreOrder(
          state,
          action.payload.projectId
            ? { type: "project", projectId: action.payload.projectId }
            : { type: "root" },
          action.payload.id,
        );
      })
      .addCase(createSeries.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(updateSeries.fulfilled, (state, action) => {
        const updated = action.payload;
        if (!updated) return;
        const index = state.series.findIndex((s) => s.id === updated.id);
        if (index !== -1) state.series[index] = updated;
      })
      .addCase(updateSeries.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(applySeriesProject, (state, action) => {
        const { id, projectId } = action.payload;
        const series = state.series.find((x) => x.id === id);
        if (!series) return;
        const from: TreeContainer = series.projectId
          ? { type: "project", projectId: series.projectId }
          : { type: "root" };
        const to: TreeContainer = projectId
          ? { type: "project", projectId }
          : { type: "root" };
        removeFromStoreOrder(state, from, id);
        series.projectId = projectId;
        addToStoreOrder(state, to, id);
      })
      .addCase(moveSeries.fulfilled, (state, action) => {
        const updated = action.payload;
        if (!updated) return;
        const s = state.series.find((x) => x.id === updated.id);
        if (s) s.projectId = updated.projectId ?? null;
      })
      .addCase(moveSeries.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(deleteSeries.fulfilled, (state, action) => {
        if (action.payload) {
          state.series = state.series.filter((s) => s.id !== action.payload);
          forgetFromOrders(state, action.payload);
        }
      })
      .addCase(deleteSeries.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      // ── Projects ──
      .addCase(loadProjects.fulfilled, (state, action) => {
        state.projects = action.payload || [];
      })
      .addCase(loadProjects.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(createProject.fulfilled, (state, action) => {
        if (!action.payload) return;
        state.projects.unshift(action.payload);
        // A project only ever lives at root (§11, entry 9).
        addToStoreOrder(state, { type: "root" }, action.payload.id);
      })
      .addCase(createProject.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(updateProject.fulfilled, (state, action) => {
        const updated = action.payload;
        if (!updated) return;
        const index = state.projects.findIndex((p) => p.id === updated.id);
        if (index !== -1) state.projects[index] = updated;
      })
      .addCase(updateProject.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(deleteProject.fulfilled, (state, action) => {
        const deletedId = action.payload;
        if (!deletedId) return;
        state.projects = state.projects.filter((p) => p.id !== deletedId);
        forgetFromOrders(state, deletedId);
        // The deleted project's series are freed to the end of the root list,
        // which is where the server put them; the tolerant reader draws an id
        // the array has not heard of exactly there, so nothing has to be
        // appended for the two to agree.
        state.series.forEach((s) => {
          if (s.projectId === deletedId) s.projectId = null;
        });
      })
      .addCase(deleteProject.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      // ── Order (docs/plans/ordering-simplification.md §4/§5) ──
      .addCase(loadRootOrder.fulfilled, (state, action) => {
        // Null means the session's root order came in with the session itself;
        // only a guest's has to be read from storage (§7).
        if (action.payload) state.guestRootOrder = action.payload;
      })
      .addCase(applyOrder, (state, action) => {
        writeStoreOrder(
          state,
          action.payload.container,
          action.payload.orderedIds,
        );
      })
      .addCase(setOrder.rejected, (state, action) => {
        announceFailure(state, action.payload);
      });
  },
});

// ── Re-exports so external consumers keep the same import paths ──────────────
export { loadSession } from "./thunks/sessionThunks";

export {
  applyPostContainer,
  createPost,
  deletePost,
  duplicatePost,
  forkPost,
  getPost,
  getPostById,
  getPostChildren,
  loadPosts,
  mergePostsIntoTabs,
  movePost,
  updatePost,
} from "./thunks/postThunks";

export {
  createRevision,
  deleteRevision,
  getRevision,
} from "./thunks/revisionThunks";

export {
  fetchStorageUsage,
  getPostThumbnail,
  getStorageUsage,
} from "./thunks/storageThunks";

export {
  applySeriesProject,
  createSeries,
  deleteSeries,
  loadSeries,
  moveSeries,
  updateSeries,
} from "./thunks/seriesThunks";
export {
  createProject,
  deleteProject,
  loadProjects,
  updateProject,
} from "./thunks/projectThunks";
export {
  applyOrder,
  loadRootOrder,
  type OrderArg,
  setOrder,
} from "./thunks/orderThunks";
export {
  acceptAgentPost,
  approveProposal,
  discardAgentPost,
  refreshProposals,
  rejectProposal,
} from "./thunks/proposalThunks";
export { catchUpPosts, fetchChangedPosts } from "./thunks/changeThunks";
export { alert, updateUser } from "./thunks/userThunks";
export { importGuestDrafts } from "./thunks/importGuestDrafts";

export default appSlice.reducer;
