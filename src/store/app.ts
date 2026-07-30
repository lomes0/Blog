import {
  createEntityAdapter,
  createSlice,
  EntityState,
  PayloadAction,
} from "@reduxjs/toolkit";
import {
  Announcement,
  AppState,
  Post,
  SaveStatus,
  Series,
  SidebarView,
} from "../types";

// ── Domain thunks (split into separate files for maintainability) ────────────
import { loadSession } from "./thunks/sessionThunks";
import {
  applyPostRank,
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
  applySeriesRank,
  createSeries,
  deleteSeries,
  loadSeries,
  moveSeries,
  updateSeries,
} from "./thunks/seriesThunks";
import {
  applyProjectRank,
  createProject,
  deleteProject,
  loadProjects,
  moveProject,
  updateProject,
} from "./thunks/projectThunks";
import { alert, updateUser } from "./thunks/userThunks";
import { importGuestDrafts } from "./thunks/importGuestDrafts";
import { createApiThunk, type Failure } from "./thunks/createApiThunk";

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

/** Drop a post from the store and from any series that lists it. */
function removePost(state: AppState, id: string) {
  postsAdapter.removeOne(state.posts, id);
  for (const series of state.series) {
    if (series.posts?.length) {
      series.posts = series.posts.filter((post) => post.id !== id);
    }
  }
}

/** Push a thunk's `rejectWithValue` payload onto the announcement queue. */
const announceFailure = (state: AppState, payload: unknown) => {
  state.ui.announcements.push({ message: payload as Failure });
};

const initialState: AppState = {
  posts: postsAdapter.getInitialState(),
  series: [],
  projects: [],
  ui: {
    announcements: [],
    alerts: [],
    initialized: false,
    postsLoading: false,
    saveStatus: {},
    drawer: false,
    page: 1,
    diff: {
      open: false,
    },
    attachmentPreview: null,
    attachmentModified: null,
    tabs: {
      rootId: null,
      tabIds: [],
      activeTabId: null,
      dirtyTabIds: [],
    },
    sidebarView: "explorer",
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
    setDiff: (
      state,
      action: PayloadAction<Partial<AppState["ui"]["diff"]>>,
    ) => {
      state.ui.diff = { ...state.ui.diff, ...action.payload };
    },
    initTabs: (
      state,
      action: PayloadAction<{ rootId: string; childIds: string[] }>,
    ) => {
      const { rootId, childIds } = action.payload;
      state.ui.tabs = {
        rootId,
        tabIds: [rootId, ...childIds],
        activeTabId: rootId,
        dirtyTabIds: [],
      };
    },
    setActiveTab: (state, action: PayloadAction<string>) => {
      state.ui.tabs.activeTabId = action.payload;
    },
    addTab: (state, action: PayloadAction<string>) => {
      if (!state.ui.tabs.tabIds.includes(action.payload)) {
        state.ui.tabs.tabIds.push(action.payload);
      }
      state.ui.tabs.activeTabId = action.payload;
    },
    removeTab: (state, action: PayloadAction<string>) => {
      const idx = state.ui.tabs.tabIds.indexOf(action.payload);
      state.ui.tabs.tabIds = state.ui.tabs.tabIds.filter(
        (id) => id !== action.payload,
      );
      state.ui.tabs.dirtyTabIds = state.ui.tabs.dirtyTabIds.filter(
        (id) => id !== action.payload,
      );
      if (state.ui.tabs.activeTabId === action.payload) {
        const newIdx = Math.min(idx, state.ui.tabs.tabIds.length - 1);
        state.ui.tabs.activeTabId = state.ui.tabs.tabIds[newIdx] ?? null;
      }
    },
    reorderTabs: (state, action: PayloadAction<string[]>) => {
      state.ui.tabs.tabIds = action.payload;
    },
    markTabDirty: (state, action: PayloadAction<string>) => {
      if (!state.ui.tabs.dirtyTabIds.includes(action.payload)) {
        state.ui.tabs.dirtyTabIds.push(action.payload);
      }
    },
    markTabClean: (state, action: PayloadAction<string>) => {
      state.ui.tabs.dirtyTabIds = state.ui.tabs.dirtyTabIds.filter(
        (id) => id !== action.payload,
      );
    },
    clearTabs: (state) => {
      state.ui.tabs = {
        rootId: null,
        tabIds: [],
        activeTabId: null,
        dirtyTabIds: [],
      };
    },
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
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        postsAdapter.setAll(state.posts, sorted);
      })
      .addCase(loadPosts.rejected, (state, action) => {
        state.ui.postsLoading = false;
        announceFailure(state, action.payload);
      })
      .addCase(getPost.fulfilled, (state, action) => {
        applyPost(state.posts, state.series, action.payload);
      })
      .addCase(createPost.fulfilled, (state, action) => {
        applyPost(state.posts, state.series, action.payload);
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
      .addCase(applyPostRank, (state, action) => {
        const { id, rank } = action.payload;
        const post = state.posts.entities[id];
        if (post) post.rank = rank;
        // Reflect on the copy inside its series (for series-internal reorder).
        for (const s of state.series) {
          const p = s.posts.find((post) => post.id === id);
          if (p) p.rank = rank;
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
      // ── User ──
      .addCase(updateUser.fulfilled, (state, action) => {
        state.user = action.payload;
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
        if (action.payload) state.series.unshift(action.payload);
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
      .addCase(applySeriesRank, (state, action) => {
        const s = state.series.find((x) => x.id === action.payload.id);
        if (!s) return;
        s.rank = action.payload.rank;
        // Only touch membership when the caller included it (a move), so a plain
        // reorder never clears the series' project.
        if ("projectId" in action.payload) {
          s.projectId = action.payload.projectId ?? null;
        }
      })
      .addCase(moveSeries.fulfilled, (state, action) => {
        const updated = action.payload;
        if (!updated) return;
        const s = state.series.find((x) => x.id === updated.id);
        if (s) {
          s.rank = updated.rank;
          s.projectId = updated.projectId ?? null;
        }
      })
      .addCase(moveSeries.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(deleteSeries.fulfilled, (state, action) => {
        if (action.payload) {
          state.series = state.series.filter((s) => s.id !== action.payload);
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
        if (action.payload) state.projects.unshift(action.payload);
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
      .addCase(applyProjectRank, (state, action) => {
        const p = state.projects.find((x) => x.id === action.payload.id);
        if (p) p.rank = action.payload.rank;
      })
      .addCase(moveProject.fulfilled, (state, action) => {
        const updated = action.payload;
        if (!updated) return;
        const p = state.projects.find((x) => x.id === updated.id);
        if (p) p.rank = updated.rank;
      })
      .addCase(moveProject.rejected, (state, action) => {
        announceFailure(state, action.payload);
      })
      .addCase(deleteProject.fulfilled, (state, action) => {
        const deletedId = action.payload;
        if (!deletedId) return;
        state.projects = state.projects.filter((p) => p.id !== deletedId);
        // The deleted project's series are freed to root; reflect that so the
        // sidebar stops nesting them (a reload settles their exact rank).
        state.series.forEach((s) => {
          if (s.projectId === deletedId) s.projectId = null;
        });
      })
      .addCase(deleteProject.rejected, (state, action) => {
        announceFailure(state, action.payload);
      });
  },
});

// ── Re-exports so external consumers keep the same import paths ──────────────
export { loadSession } from "./thunks/sessionThunks";

export {
  applyPostRank,
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
  moveProject,
  updateProject,
} from "./thunks/projectThunks";
export { alert, updateUser } from "./thunks/userThunks";
export { importGuestDrafts } from "./thunks/importGuestDrafts";

export default appSlice.reducer;
