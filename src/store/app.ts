import {
  createAction,
  createAsyncThunk,
  createEntityAdapter,
  createSlice,
  EntityState,
  PayloadAction,
} from "@reduxjs/toolkit";
import {
  Announcement,
  AppState,
  CloudDocumentRevision,
  Document,
  EditorDocumentRevision,
  EMPTY_EDITOR_STATE,
  Series,
  UserDocument,
} from "../types";

import { duplicateDocument } from "./app/duplicateDocument";

// ── Domain thunks (split into separate files for maintainability) ────────────
import { loadSession } from "./thunks/sessionThunks";
import {
  applyDocumentRank,
  createCloudDocument,
  createLocalDocument,
  deleteCloudDocument,
  deleteLocalDocument,
  forkCloudDocument,
  getCloudDocument,
  getLocalDocument,
  loadCloudDocuments,
  loadLocalDocuments,
  moveCloudDocument,
  moveLocalDocument,
  updateCloudDocument,
  updateLocalDocument,
} from "./thunks/documentThunks";
import {
  createCloudRevision,
  createLocalRevision,
  deleteCloudRevision,
  deleteLocalRevision,
  getCloudRevision,
  updateLocalRevision,
} from "./thunks/revisionThunks";
import {
  applySeriesRank,
  createSeries,
  deleteSeries,
  loadSeries,
  moveSeries,
  updateSeries,
} from "./thunks/seriesThunks";
import { alert, updateUser } from "./thunks/userThunks";

export const documentsAdapter = createEntityAdapter<UserDocument>();

/** Insert a new entity at the front of ids[] so it appears first in the list. */
function prependOneDoc(
  adapterState: EntityState<UserDocument, string>,
  entity: UserDocument,
) {
  documentsAdapter.addOne(adapterState, entity);
  const idx = adapterState.ids.indexOf(entity.id);
  if (idx > 0) {
    adapterState.ids.splice(idx, 1);
    adapterState.ids.unshift(entity.id);
  }
}

/**
 * Apply an authoritative cloud Document to the store: upsert its entity and keep
 * `series.posts` in sync with any series-membership change. Shared by the
 * update and move thunks.
 */
function applyCloudDocument(
  documents: EntityState<UserDocument, string>,
  series: Series[],
  document: Document,
) {
  const existing = documents.entities[document.id];
  const previousSeriesId = existing?.cloud?.seriesId;
  if (!existing) {
    prependOneDoc(documents, { id: document.id, cloud: document });
  } else {
    existing.cloud = document;
  }
  // Remove from its previous series when membership changed.
  if (previousSeriesId && previousSeriesId !== document.seriesId) {
    const oldSeries = series.find((s) => s.id === previousSeriesId);
    if (oldSeries) {
      oldSeries.posts = oldSeries.posts.filter((p) => p.id !== document.id);
    }
  }
  // Add/refresh it in its current series.
  if (document.seriesId) {
    const target = series.find((s) => s.id === document.seriesId);
    if (target) {
      const idx = target.posts.findIndex((p) => p.id === document.id);
      if (idx === -1) target.posts.push(document);
      else target.posts[idx] = document;
    }
  }
}

const initialState: AppState = {
  documents: documentsAdapter.getInitialState(),
  series: [],
  ui: {
    announcements: [],
    alerts: [],
    initialized: false,
    documentsLoading: false,
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
    copilot: {
      open: false,
    },
  },
};

export const triggerAutosaveBeforeNavigation = createAction<
  { targetUrl: string }
>("app/triggerAutosaveBeforeNavigation");

export const load = createAsyncThunk("app/load", async (_, thunkAPI) => {
  await Promise.allSettled([
    thunkAPI.dispatch(loadSession()),
    thunkAPI.dispatch(loadLocalDocuments()),
  ]);

  // Load cloud documents, then series to ensure series.posts is authoritative
  await thunkAPI.dispatch(loadCloudDocuments());
  await thunkAPI.dispatch(loadSeries());
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
    setCopilotOpen: (state, action: PayloadAction<boolean>) => {
      state.ui.copilot.open = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(load.fulfilled, (state, _action) => {
        const sorted =
          (Object.values(state.documents.entities) as UserDocument[])
            .sort((a, b) => {
              const first = a.local?.updatedAt || a.cloud?.updatedAt;
              const second = b.local?.updatedAt || b.cloud?.updatedAt;
              if (!first && !second) return 0;
              if (!first) return 1;
              if (!second) return -1;
              return new Date(second).getTime() - new Date(first).getTime();
            });
        documentsAdapter.setAll(state.documents, sorted);
        state.ui.initialized = true;
      })
      .addCase(loadSession.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(loadLocalDocuments.fulfilled, (state, action) => {
        const documents = action.payload;
        documents.forEach((document) => {
          const existing = state.documents.entities[document.id];
          if (!existing) {
            documentsAdapter.addOne(state.documents, {
              id: document.id,
              local: document,
            });
          } else {
            existing.local = document;
          }
        });
      })
      .addCase(loadCloudDocuments.pending, (state) => {
        state.ui.documentsLoading = true;
      })
      .addCase(loadCloudDocuments.fulfilled, (state, action) => {
        state.ui.documentsLoading = false;
        const documents = action.payload;
        documents.forEach((document) => {
          const existing = state.documents.entities[document.id];
          if (!existing) {
            documentsAdapter.addOne(state.documents, {
              id: document.id,
              cloud: document,
            });
          } else {
            existing.cloud = document;
          }
        });
      })
      .addCase(loadCloudDocuments.rejected, (state) => {
        state.ui.documentsLoading = false;
      })
      .addCase(getLocalDocument.fulfilled, (state, action) => {
        const document = action.payload;
        const existing = state.documents.entities[document.id];
        if (!existing) {
          prependOneDoc(state.documents, { id: document.id, local: document });
        } else {
          existing.local = document;
        }
      })
      .addCase(getCloudDocument.fulfilled, (state, action) => {
        const { cloudDocument } = action.payload;
        const existing = state.documents.entities[cloudDocument.id];
        if (!existing) {
          prependOneDoc(state.documents, {
            id: cloudDocument.id,
            cloud: cloudDocument,
          });
        } else {
          existing.cloud = cloudDocument;
        }
      })
      .addCase(getCloudRevision.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(forkCloudDocument.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(createLocalDocument.fulfilled, (state, action) => {
        const document = action.payload;
        const existing = state.documents.entities[document.id];
        if (!existing) {
          prependOneDoc(state.documents, {
            id: document.id,
            local: document,
          });
        } else {
          existing.local = document;
        }
      })
      .addCase(createLocalRevision.fulfilled, (state, action) => {
        const revision = action.payload;
        const userDocument = state.documents.entities[revision.documentId];
        if (!userDocument) return;
        const localDocument = userDocument.local;
        if (!localDocument) return;
        if (!localDocument.revisions) localDocument.revisions = [];
        localDocument.revisions?.unshift({
          ...revision,
          data: EMPTY_EDITOR_STATE,
        });
      })
      .addCase(updateLocalRevision.fulfilled, (state, action) => {
        const revision = action.payload;
        const userDocument = state.documents.entities[revision.documentId];
        if (!userDocument) return;
        const localDocument = userDocument.local;
        if (!localDocument) return;
        const existing = localDocument.revisions?.find(
          (r) => r.id === revision.id,
        );
        if (existing) {
          existing.createdAt = revision.createdAt;
        }
      })
      .addCase(createCloudDocument.fulfilled, (state, action) => {
        const document = action.payload;
        const existing = state.documents.entities[document.id];
        if (!existing) {
          prependOneDoc(state.documents, {
            id: document.id,
            cloud: document,
          });
        } else {
          existing.cloud = document;
        }
        // Keep series.posts in sync so the sidebar groups the post immediately
        if (document.seriesId) {
          const series = state.series.find((s) => s.id === document.seriesId);
          if (series) {
            const alreadyInSeries = series.posts.some((p) =>
              p.id === document.id
            );
            if (!alreadyInSeries) {
              series.posts.push(document);
            }
          }
        }
      })
      .addCase(createCloudDocument.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(createCloudRevision.fulfilled, (state, action) => {
        const revision = action.payload;
        const document = state.documents.entities[revision.documentId];
        if (!document?.cloud) return;
        document.cloud.revisions.unshift(revision);
      })
      .addCase(createCloudRevision.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(updateLocalDocument.fulfilled, (state, action) => {
        const { id, partial } = action.payload;
        const userDocument = state.documents.entities[id];
        if (!userDocument) return;
        const localDocument = userDocument.local;
        if (!localDocument) return;
        Object.assign(localDocument, partial);
      })
      .addCase(updateCloudDocument.fulfilled, (state, action) => {
        applyCloudDocument(state.documents, state.series, action.payload);
      })
      .addCase(updateCloudDocument.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(applyDocumentRank, (state, action) => {
        const { id, rank } = action.payload;
        const entity = state.documents.entities[id];
        if (entity?.cloud) entity.cloud.rank = rank;
        if (entity?.local) entity.local.rank = rank;
        // Reflect on the post inside its series (for series-internal reorder).
        for (const s of state.series) {
          const p = s.posts.find((post) => post.id === id);
          if (p) p.rank = rank;
        }
      })
      .addCase(moveCloudDocument.fulfilled, (state, action) => {
        applyCloudDocument(state.documents, state.series, action.payload);
      })
      .addCase(moveCloudDocument.rejected, (state, action) => {
        const message = action.payload as { title: string; subtitle: string };
        state.ui.announcements.push({ message });
      })
      .addCase(moveLocalDocument.fulfilled, (state, action) => {
        const { id, partial } = action.payload;
        const local = state.documents.entities[id]?.local;
        if (local) Object.assign(local, partial);
      })
      .addCase(deleteLocalDocument.fulfilled, (state, action) => {
        const id = action.payload;
        const userDocument = state.documents.entities[id];
        if (!userDocument) return;
        if (!userDocument.cloud) {
          documentsAdapter.removeOne(state.documents, id);
        } else {
          delete userDocument.local;
        }

        // Also remove the post from any series that contains it
        if (state.series && state.series.length > 0) {
          state.series.forEach((series) => {
            if (series.posts && series.posts.length > 0) {
              series.posts = series.posts.filter((post) => post.id !== id);
            }
          });
        }
      })
      .addCase(deleteLocalRevision.fulfilled, (state, action) => {
        const { id, documentId } = action.payload;
        const userDocument = state.documents.entities[documentId];
        if (!userDocument) return;
        const localDocument = userDocument.local;
        if (!localDocument) return;
        if (!localDocument.revisions) return;
        const revision = localDocument.revisions.find(
          (revision: EditorDocumentRevision) => revision.id === id,
        );
        if (!revision) return;
        localDocument.revisions = localDocument.revisions.filter(
          (revision: EditorDocumentRevision) => revision.id !== id,
        );
      })
      .addCase(deleteCloudDocument.fulfilled, (state, action) => {
        const id = action.payload;
        const userDocument = state.documents.entities[id];
        if (!userDocument) return;
        if (!userDocument.local) {
          documentsAdapter.removeOne(state.documents, id);
        } else {
          delete userDocument.cloud;
        }

        // Also remove the post from any series that contains it
        if (state.series && state.series.length > 0) {
          state.series.forEach((series) => {
            if (series.posts && series.posts.length > 0) {
              series.posts = series.posts.filter((post) => post.id !== id);
            }
          });
        }
      })
      .addCase(deleteCloudDocument.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(deleteCloudRevision.fulfilled, (state, action) => {
        const { id, documentId } = action.payload as CloudDocumentRevision;
        const userDocument = state.documents.entities[documentId];
        if (!userDocument) return;
        const cloudDocument = userDocument.cloud;
        if (!cloudDocument) return;
        cloudDocument.revisions = cloudDocument.revisions.filter(
          (revision) => revision.id !== id,
        );
      })
      .addCase(deleteCloudRevision.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(updateUser.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(updateUser.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(duplicateDocument.fulfilled, (state, action) => {
        const duplicatedDoc = action.payload;
        const newUserDocument: UserDocument = {
          id: duplicatedDoc.id,
          local: duplicatedDoc,
        };
        documentsAdapter.addOne(state.documents, newUserDocument);
      })
      .addCase(duplicateDocument.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(alert.pending, (state, action) => {
        const alertPayload = action.meta.arg;
        state.ui.alerts.push(alertPayload);
      })
      .addCase(alert.fulfilled, (state) => {
        state.ui.alerts.shift();
      })
      .addCase(alert.rejected, (state, action) => {
        state.ui.alerts.shift();
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      // ===== SERIES MANAGEMENT REDUCER CASES =====
      .addCase(loadSeries.fulfilled, (state, action) => {
        state.series = action.payload || [];
      })
      .addCase(loadSeries.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(createSeries.fulfilled, (state, action) => {
        const series = action.payload;
        if (series) {
          state.series.unshift(series);
        }
      })
      .addCase(createSeries.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(updateSeries.fulfilled, (state, action) => {
        const updatedSeries = action.payload;
        if (updatedSeries) {
          const index = state.series.findIndex((s) =>
            s.id === updatedSeries.id
          );
          if (index !== -1) {
            state.series[index] = updatedSeries;
          }
        }
      })
      .addCase(updateSeries.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(applySeriesRank, (state, action) => {
        const s = state.series.find((x) => x.id === action.payload.id);
        if (s) s.rank = action.payload.rank;
      })
      .addCase(moveSeries.fulfilled, (state, action) => {
        const updated = action.payload;
        if (!updated) return;
        const s = state.series.find((x) => x.id === updated.id);
        if (s) s.rank = updated.rank;
      })
      .addCase(moveSeries.rejected, (state, action) => {
        const message = action.payload as { title: string; subtitle: string };
        state.ui.announcements.push({ message });
      })
      .addCase(deleteSeries.fulfilled, (state, action) => {
        const deletedSeriesId = action.payload;
        if (deletedSeriesId) {
          state.series = state.series.filter((s) => s.id !== deletedSeriesId);
        }
      })
      .addCase(deleteSeries.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      });
  },
});

// ── Re-exports so external consumers keep the same import paths ──────────────
export { loadSession } from "./thunks/sessionThunks";

export {
  createCloudDocument,
  createLocalDocument,
  deleteCloudDocument,
  deleteLocalDocument,
  forkCloudDocument,
  forkLocalDocument,
  getCloudDocument,
  getDocumentById,
  getLocalDocument,
  loadCloudDocuments,
  loadLocalDocuments,
  mergeCloudDocumentsIntoTabs,
  moveCloudDocument,
  moveDocument,
  moveLocalDocument,
  syncLocalToCloud,
  updateCloudDocument,
  updateLocalDocument,
} from "./thunks/documentThunks";

export {
  createCloudRevision,
  createLocalRevision,
  deleteCloudRevision,
  deleteLocalRevision,
  getCloudRevision,
  getLocalDocumentRevisions,
  getLocalRevision,
  updateLocalRevision,
} from "./thunks/revisionThunks";

export {
  fetchCloudStorageUsage,
  fetchLocalStorageUsage,
  getCloudDocumentThumbnail,
  getCloudStorageUsage,
  getLocalStorageUsage,
} from "./thunks/storageThunks";

export {
  createSeries,
  deleteSeries,
  loadSeries,
  moveSeries,
  updateSeries,
} from "./thunks/seriesThunks";
export { alert, updateUser } from "./thunks/userThunks";
export { duplicateDocument } from "./app/duplicateDocument";

export default appSlice.reducer;
