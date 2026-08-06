import {
  useDispatch as useReduxDispatch,
  useSelector as useReduxSelector,
  useStore as useReduxStore,
} from "react-redux";
import {
  acceptAgentPost,
  alert,
  approveProposal,
  appSlice,
  createPost,
  createProject,
  createRevision,
  createSeries,
  deletePost,
  deleteProject,
  deleteRevision,
  deleteSeries,
  discardAgentPost,
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
  refreshProposals,
  rejectProposal,
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

  refreshProposals,
  approveProposal,
  rejectProposal,
  acceptAgentPost,
  discardAgentPost,
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

/*
 * There is deliberately no `selectIsDirty` here, and no `ui.dirtyDocIds` behind
 * it any more.
 *
 * The selector read `dirtyDocIds.length > 0` — true whenever *any* open tab was
 * dirty, which is almost never what a per-pane control means; the editor
 * toolbar's Save button enabled itself because a document in the *other* pane
 * had been typed into. Once autosave went quiet the slice had six writers and
 * no readers, and maintaining it cost a full `JSON.stringify` of the document
 * every 300ms on the typing path.
 *
 * What replaced it is narrower and already sufficient: `savedBaseline` in
 * `useSave` is the exact comparison a save makes, and `selectSaveTrouble` below
 * answers the only question anything actually asked. A close guard that wants
 * "does this document have unsent edits" should ask `pendingSaves`, which is
 * the durable record rather than a mirror of one.
 */

/**
 * A document's save state, and *only* when it is worth saying out loud.
 *
 * `idle` is absent from the map by construction (`setSaveStatus` deletes it),
 * and `saving` is folded into "nothing to report": on the happy path it is a
 * ~200ms round trip, so painting it would reintroduce exactly the flicker the
 * quiet-autosave work removed. What survives is the pair of states where the
 * user's assumption — "it saved" — has actually stopped being true.
 */
export const selectSaveTrouble =
  (id: string | null | undefined) => (state: RootState) => {
    if (!id) return undefined;
    const status = state.ui.saveStatus[id];
    return status === "retrying" || status === "error" ? status : undefined;
  };

/** As `selectSaveTrouble`, but for anything open — for always-visible chrome. */
export const selectAnySaveTrouble = (state: RootState) => {
  const statuses = Object.values(state.ui.saveStatus);
  if (statuses.includes("error")) return "error" as const;
  return statuses.includes("retrying") ? ("retrying" as const) : undefined;
};

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
