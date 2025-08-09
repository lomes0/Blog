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
  deleteCloudDocument,
  deleteCloudRevision,
  deleteLocalDocument,
  deleteLocalRevision,
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
  updateCloudDocument,
  updateLocalDocument,
  updateUser,
} from "./app";
import { deleteDomain, fetchUserDomains, reorderDomains } from "./app/domains";
import { Action, configureStore, ThunkAction } from "@reduxjs/toolkit";

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

  getLocalDocumentRevisions,
  getLocalRevision,
  getCloudRevision,
  createLocalRevision,
  createCloudRevision,
  deleteLocalRevision,
  deleteCloudRevision,

  updateUser,
  alert,

  getLocalStorageUsage,
  getCloudStorageUsage,
  getCloudDocumentThumbnail,
  getDocumentById,

  fetchUserDomains,
  deleteDomain,
  reorderDomains,
};

export const store = configureStore({ reducer: appSlice.reducer });

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;

export const useDispatch: () => AppDispatch = useReduxDispatch;
export const useSelector: <T>(selector: (state: RootState) => T) => T =
  useReduxSelector;
