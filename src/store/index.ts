import {
  useDispatch as useReduxDispatch,
  useSelector as useReduxSelector,
  useStore as useReduxStore,
} from "react-redux";
import {
  alert,
  appSlice,
  createPost,
  createProject,
  createRevision,
  createSeries,
  deletePost,
  deleteProject,
  deleteRevision,
  deleteSeries,
  duplicatePost,
  forkPost,
  getPost,
  getPostById,
  getPostChildren,
  getPostThumbnail,
  getRevision,
  getStorageUsage,
  importGuestDrafts,
  load,
  loadPosts,
  loadProjects,
  loadSeries,
  mergePostsIntoTabs,
  movePost,
  moveProject,
  moveSeries,
  postsAdapter,
  updatePost,
  updateProject,
  updateSeries,
  updateUser,
} from "./app";
import { Action, configureStore, ThunkAction } from "@reduxjs/toolkit";
import { nprogressMiddleware } from "./nprogressMiddleware";
import { workspacePersistenceMiddleware } from "./workspacePersistence";

export const actions = {
  ...appSlice.actions,

  load,
  importGuestDrafts,

  loadPosts,
  getPost,
  getPostById,
  getPostChildren,
  createPost,
  updatePost,
  deletePost,
  movePost,
  duplicatePost,
  forkPost,
  mergePostsIntoTabs,

  getRevision,
  createRevision,
  deleteRevision,

  updateUser,
  alert,

  getStorageUsage,
  getPostThumbnail,

  loadSeries,
  createSeries,
  updateSeries,
  deleteSeries,
  moveSeries,

  loadProjects,
  createProject,
  updateProject,
  deleteProject,
  moveProject,
};

export const store = configureStore({
  reducer: appSlice.reducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      nprogressMiddleware,
      workspacePersistenceMiddleware,
    ),
});

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;

/** O(1) post selectors backed by the entity adapter. */
export const postsSelectors = postsAdapter.getSelectors<RootState>(
  (state) => state.posts,
);

/** Does anything open have unsaved editor content? Keyed by document, not pane. */
export const selectIsDirty = (state: RootState) =>
  state.ui.dirtyDocIds.length > 0;

export const useDispatch: () => AppDispatch = useReduxDispatch;
export const useSelector: <T>(
  selector: (state: RootState) => T,
  equalityFn?: (left: T, right: T) => boolean,
) => T = useReduxSelector;

/**
 * The store itself, for the rare effect that must read state at the moment it
 * acts rather than at the render it was scheduled from.
 *
 * `useSelector` gives you the value as of a render, and effects in one commit
 * all see that same snapshot — so an effect cannot observe a dispatch made by a
 * sibling effect beside it. Anything that *projects* current state outwards
 * (the workspace URL) has to read it fresh, or it will write an answer that was
 * already stale before it ran.
 */
export const useStore: () => AppStore = useReduxStore;
export type AppStore = typeof store;
