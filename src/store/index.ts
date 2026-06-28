import {
  useDispatch as useReduxDispatch,
  useSelector as useReduxSelector,
} from "react-redux";
import {
  alert,
  appSlice,
  createCloudDocument,
  createCloudRevision,
  createLocalDocument,
  createLocalRevision,
  createSeries,
  deleteCloudDocument,
  deleteCloudRevision,
  deleteLocalDocument,
  deleteLocalRevision,
  deleteSeries,
  documentsAdapter,
  duplicateDocument,
  forkCloudDocument,
  forkLocalDocument,
  getCloudDocument,
  getCloudDocumentThumbnail,
  getCloudRevision,
  getCloudStorageUsage,
  getDocumentById,
  getLocalDocument,
  getLocalDocumentRevisions,
  getLocalRevision,
  getLocalStorageUsage,
  load,
  loadCloudDocuments,
  loadLocalDocuments,
  // New post and series actions
  loadSeries,
  mergeCloudDocumentsIntoTabs,
  syncLocalToCloud,
  updateCloudDocument,
  updateLocalDocument,
  updateLocalRevision,
  updateSeries,
  updateUser,
} from "./app";
import { Action, configureStore, ThunkAction } from "@reduxjs/toolkit";
import { nprogressMiddleware } from "./nprogressMiddleware";

export const actions = {
  ...appSlice.actions,

  load,
  loadLocalDocuments,
  loadCloudDocuments,

  getLocalDocument,
  createLocalDocument,
  updateLocalDocument,
  deleteLocalDocument,
  forkLocalDocument,
  duplicateDocument,

  getCloudDocument,
  createCloudDocument,
  updateCloudDocument,
  deleteCloudDocument,
  forkCloudDocument,
  mergeCloudDocumentsIntoTabs,

  getLocalDocumentRevisions,
  getLocalRevision,
  getCloudRevision,
  createLocalRevision,
  updateLocalRevision,
  createCloudRevision,
  deleteLocalRevision,
  deleteCloudRevision,

  syncLocalToCloud,
  updateUser,
  alert,

  getLocalStorageUsage,
  getCloudStorageUsage,
  getCloudDocumentThumbnail,
  getDocumentById,

  // New post and series actions
  loadSeries,
  createSeries,
  updateSeries,
  deleteSeries,
};

export const store = configureStore({
  reducer: appSlice.reducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(nprogressMiddleware),
});

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;

/** O(1) document selectors backed by entity adapter */
export const documentsSelectors = documentsAdapter.getSelectors<RootState>(
  (state) => state.documents,
);

export const selectIsDirty = (state: RootState) =>
  state.ui.tabs.dirtyTabIds.length > 0;

export const useDispatch: () => AppDispatch = useReduxDispatch;
export const useSelector: <T>(
  selector: (state: RootState) => T,
  equalityFn?: (left: T, right: T) => boolean,
) => T = useReduxSelector;
