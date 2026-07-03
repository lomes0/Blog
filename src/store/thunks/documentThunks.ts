import { createAction, createAsyncThunk } from "@reduxjs/toolkit";
import documentDB, { revisionDB } from "@/indexeddb";
import {
  AppState,
  BackupDocument,
  Document,
  DocumentCreateInput,
  DocumentUpdateInput,
  EditorDocument,
  EMPTY_EDITOR_STATE,
} from "@/types";
import { apiClient } from "@/api";
import { v4 as uuidv4, validate } from "uuid";
import { createCloudRevision } from "./revisionThunks";
import { rankAtEnd, rankBetween, type Ranked } from "@/lib/ordering";
import type { SerializedEditorState } from "lexical";

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

export const loadLocalDocuments = createAsyncThunk(
  "app/loadLocalDocuments",
  async (_, thunkAPI) => {
    try {
      const documents = await documentDB.getAll();
      const revisions = await revisionDB.getAll();
      const localDocuments: EditorDocument[] = await Promise.all(
        documents.map(async (document) => {
          const { data: _data, ...rest } = document;
          const backupDocument: BackupDocument = {
            ...document,
            revisions: revisions.filter((revision) =>
              revision.documentId === document.id
            ),
          };
          const localRevisions = backupDocument.revisions.map((
            { data: _data, ...rest },
          ) => ({
            ...rest,
            createdAt: rest.createdAt instanceof Date
              ? rest.createdAt.toISOString()
              : rest.createdAt,
          }));
          const localDocument: EditorDocument = {
            ...rest,
            createdAt: rest.createdAt instanceof Date
              ? rest.createdAt.toISOString()
              : rest.createdAt,
            updatedAt: rest.updatedAt instanceof Date
              ? rest.updatedAt.toISOString()
              : rest.updatedAt,
            data: EMPTY_EDITOR_STATE,
            revisions: localRevisions.map((rev) => ({
              ...rev,
              data: EMPTY_EDITOR_STATE,
            })),
          };
          return localDocument;
        }),
      );
      return thunkAPI.fulfillWithValue(localDocuments);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const loadCloudDocuments = createAsyncThunk(
  "app/loadCloudDocuments",
  async (arg: Document[] | undefined, thunkAPI) => {
    try {
      if (arg) {
        return thunkAPI.fulfillWithValue(arg);
      }
      const data = await apiClient.documents.list();
      return thunkAPI.fulfillWithValue(data ?? []);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const getLocalDocument = createAsyncThunk(
  "app/getLocalDocument",
  async (id: string, thunkAPI) => {
    try {
      const isValidId = validate(id);
      const document = isValidId
        ? await documentDB.getByID(id)
        : await documentDB.getOneByKey("handle", id);
      if (!document) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "document not found",
        });
      }
      return thunkAPI.fulfillWithValue(document);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const getCloudDocument = createAsyncThunk(
  "app/getCloudDocument",
  async (id: string, thunkAPI) => {
    try {
      const data = await apiClient.documents.get(id);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "document not found",
        });
      }
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const forkLocalDocument = createAsyncThunk(
  "app/forkLocalDocument",
  async (
    arg: { id: string; revisionId?: string | null },
    thunkAPI,
  ) => {
    try {
      const { id, revisionId } = arg;
      const isValidId = validate(id);
      const document = isValidId
        ? await documentDB.getByID(id)
        : await documentDB.getOneByKey("handle", id);
      if (!document) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "document not found",
        });
      }
      if (!revisionId || revisionId === document.head) {
        return thunkAPI.fulfillWithValue(document);
      }
      const revision = await revisionDB.getByID(revisionId);
      if (!revision) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "revision not found",
        });
      }
      return thunkAPI.fulfillWithValue({
        ...document,
        head: revision.id,
        updatedAt: revision.createdAt,
        data: revision.data,
      });
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const forkCloudDocument = createAsyncThunk(
  "app/forkCloudDocument",
  async (
    arg: { id: string; revisionId?: string | null },
    thunkAPI,
  ) => {
    try {
      const { id, revisionId } = arg;
      const data = await apiClient.documents.fork(id, revisionId);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "document not found",
        });
      }
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const createLocalDocument = createAsyncThunk(
  "app/createLocalDocument",
  async (arg: DocumentCreateInput, thunkAPI) => {
    try {
      const {
        coauthors: _coauthors,
        published: _published,
        collab: _collab,
        private: _isPrivate,
        revisions,
        ...document
      } = arg;
      const id = await documentDB.add(document);
      if (!id) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to create document",
        });
      }
      const { data, ...rest } = document;
      if (revisions) await revisionDB.addMany(revisions);
      const localDocumentRevisions = (revisions ?? []).map((
        { data: _data, ...rest },
      ) => rest);
      const localDocument: EditorDocument = {
        ...rest,
        data,
        revisions: localDocumentRevisions.map((rev) => ({
          ...rev,
          data: EMPTY_EDITOR_STATE,
        })),
      };
      return thunkAPI.fulfillWithValue(localDocument);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const createCloudDocument = createAsyncThunk(
  "app/createCloudDocument",
  async (arg: DocumentCreateInput, thunkAPI) => {
    try {
      const data = await apiClient.documents.create(arg);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to create document",
        });
      }
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const updateLocalDocument = createAsyncThunk(
  "app/updateLocalDocument",
  async (
    arg: { id: string; partial: DocumentUpdateInput },
    thunkAPI,
  ) => {
    try {
      const { id, partial } = arg;
      const {
        coauthors: _coauthors,
        published: _published,
        collab: _collab,
        private: _isPrivate,
        revisions,
        ...document
      } = partial;
      const result = await documentDB.patch(id, document);
      if (!result) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to update document",
        });
      }
      const payload: { id: string; partial: Partial<EditorDocument> } = {
        id,
        partial: { ...document },
      };
      if (revisions) {
        await revisionDB.addMany(revisions);
        const localDocumentRevisions = (revisions ?? []).map((
          { data: _data, ...rest },
        ) => rest);
        payload.partial.revisions = localDocumentRevisions.map((rev) => ({
          ...rev,
          data: EMPTY_EDITOR_STATE,
        }));
      }

      return thunkAPI.fulfillWithValue(payload);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const updateCloudDocument = createAsyncThunk(
  "app/updateCloudDocument",
  async (
    arg: { id: string; partial: DocumentUpdateInput },
    thunkAPI,
  ) => {
    try {
      const { id, partial } = arg;
      const data = await apiClient.documents.update(id, partial);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to update document",
        });
      }
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

// ─── Move / reorder ──────────────────────────────────────────────────────────

export type MoveDocumentArg = {
  id: string;
  // Fully specifies the destination container (not a partial patch).
  destination: { seriesId?: string | null; parentId?: string | null };
  // Neighbour ranks to drop between; omit to append to the end.
  between?: { afterRank?: string | null; beforeRank?: string | null };
};

export const moveCloudDocument = createAsyncThunk(
  "app/moveCloudDocument",
  async (arg: MoveDocumentArg, thunkAPI) => {
    try {
      const data = await apiClient.documents.move(arg.id, {
        destination: arg.destination,
        between: arg.between,
      });
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to move document",
        });
      }
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const moveLocalDocument = createAsyncThunk(
  "app/moveLocalDocument",
  async (
    arg: { id: string; partial: Pick<EditorDocument, "rank" | "parentId"> },
    thunkAPI,
  ) => {
    try {
      const result = await documentDB.patch(arg.id, arg.partial);
      if (!result) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to move document",
        });
      }
      return thunkAPI.fulfillWithValue({ id: arg.id, partial: arg.partial });
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

// Ranks of a container's current members, read from Redux. Root mixes
// standalone documents and series (one shared rank space), mirroring the server.
function containerSiblings(
  state: AppState,
  destination: MoveDocumentArg["destination"],
  excludeId: string,
): Ranked[] {
  const seriesId = destination.seriesId ?? null;
  const parentId = seriesId ? null : (destination.parentId ?? null);
  const out: Ranked[] = [];
  for (const entity of Object.values(state.documents.entities)) {
    if (!entity || entity.id === excludeId) continue;
    const doc = entity.cloud ?? entity.local;
    if (!doc || doc.rank == null) continue;
    const docSeries = doc.seriesId ?? null;
    const docParent = doc.parentId ?? null;
    const inContainer = seriesId
      ? docSeries === seriesId
      : parentId
      ? docParent === parentId
      : !docSeries && !docParent;
    if (inContainer) out.push({ id: entity.id, rank: doc.rank });
  }
  if (!seriesId && !parentId) {
    for (const s of state.series) {
      if (s.rank != null) out.push({ id: s.id, rank: s.rank });
    }
  }
  return out;
}

// The rank a moved document should take, computed client-side. Deterministic,
// so it matches the server for `between` moves and lets local copies (which have
// no server) reorder offline.
function moveRank(state: AppState, arg: MoveDocumentArg): string {
  const { afterRank, beforeRank } = arg.between ?? {};
  if (afterRank != null || beforeRank != null) {
    return rankBetween(afterRank ?? null, beforeRank ?? null);
  }
  return rankAtEnd(containerSiblings(state, arg.destination, arg.id));
}

// Optimistically set a document's rank in the store, so a reorder is reflected
// immediately without waiting for the round-trip. Handled in the app slice.
export const applyDocumentRank = createAction<{ id: string; rank: string }>(
  "app/applyDocumentRank",
);

// Re-home / reorder a document across both stores. The cloud copy is moved by
// the server (authoritative rank); the local copy is moved with a client-computed
// rank so offline reordering works. The rank is applied optimistically first so
// same-container reorders feel instant; the server's rank (identical for
// positioned moves) confirms on fulfilment. No rollback by design.
export const moveDocument = createAsyncThunk(
  "app/moveDocument",
  async (arg: MoveDocumentArg, thunkAPI) => {
    const state = thunkAPI.getState() as AppState;
    const entity = state.documents.entities[arg.id];
    const rank = moveRank(state, arg);

    thunkAPI.dispatch(applyDocumentRank({ id: arg.id, rank }));

    if (entity?.cloud) {
      await thunkAPI.dispatch(moveCloudDocument(arg)).unwrap();
    }
    if (entity?.local) {
      const parentId = arg.destination.seriesId
        ? null
        : (arg.destination.parentId ?? null);
      await thunkAPI.dispatch(
        moveLocalDocument({ id: arg.id, partial: { rank, parentId } }),
      ).unwrap();
    }
    return arg.id;
  },
);

export const deleteLocalDocument = createAsyncThunk(
  "app/deleteLocalDocument",
  async (id: string, thunkAPI) => {
    try {
      await documentDB.deleteByID(id);
      await revisionDB.deleteManyByKey("documentId", id);
      return thunkAPI.fulfillWithValue(id);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const deleteCloudDocument = createAsyncThunk(
  "app/deleteCloudDocument",
  async (id: string, thunkAPI) => {
    try {
      const data = await apiClient.documents.delete(id);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to delete document",
        });
      }
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

/**
 * Merge several standalone cloud posts into one tabbed post.
 *
 * The first post (`targetId`) is kept as the container — its own content becomes
 * the root tab. Each source post in `sourceIds` is copied into a new child tab
 * under the target (its content carried over verbatim). If a source post itself
 * already has child tabs, those are *flattened* in as sibling tabs rather than
 * nested. Once the copies are safely created, each source post (and its former
 * children) is hard-deleted.
 *
 * Cloud-only: callers must ensure every involved post has a cloud record and the
 * user is authenticated. Tabs are appended in the order `sourceIds` is given.
 */
export const mergeCloudDocumentsIntoTabs = createAsyncThunk(
  "app/mergeCloudDocumentsIntoTabs",
  async (
    arg: { targetId: string; sourceIds: string[] },
    thunkAPI,
  ) => {
    try {
      const { targetId, sourceIds } = arg;

      // Continue numbering after any tabs the target already has.
      const existingChildren = await apiClient.documents.children(targetId) ??
        [];
      let nextOrder = existingChildren.length;

      // Create a new child tab under the target, copying name + content.
      const createTab = async (
        name: string,
        data: SerializedEditorState,
      ) => {
        const now = new Date().toISOString();
        const id = uuidv4();
        const revisionId = uuidv4();
        const newDoc: DocumentCreateInput = {
          id,
          name,
          head: revisionId,
          createdAt: now,
          updatedAt: now,
          type: "DOCUMENT",
          parentId: targetId,
          sort_order: nextOrder++,
          data,
          revisions: [{ id: revisionId, documentId: id, createdAt: now, data }],
        };
        const created = await thunkAPI.dispatch(createCloudDocument(newDoc));
        if (createCloudDocument.rejected.match(created)) {
          throw new Error(`Failed to create tab "${name}"`);
        }
      };

      for (const sourceId of sourceIds) {
        const source = await apiClient.documents.get(sourceId);
        if (!source) continue;

        // Flatten: the source's own child tabs (ordered) become siblings too.
        const childStubs = (await apiClient.documents.children(sourceId)) ?? [];
        const orderedChildStubs = [...childStubs].sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
        );

        // 1. The source post itself → a tab.
        await createTab(
          source.name ?? "Untitled",
          source.data ?? EMPTY_EDITOR_STATE,
        );

        // 2. Its existing child tabs → flattened-in sibling tabs.
        for (const stub of orderedChildStubs) {
          const child = await apiClient.documents.get(stub.id);
          if (!child) continue;
          await createTab(
            child.name ?? stub.name ?? "Untitled",
            child.data ?? EMPTY_EDITOR_STATE,
          );
        }

        // 3. Hard-delete the originals (children first, then the source).
        for (const stub of orderedChildStubs) {
          await thunkAPI.dispatch(deleteCloudDocument(stub.id));
          await thunkAPI.dispatch(deleteLocalDocument(stub.id));
        }
        await thunkAPI.dispatch(deleteCloudDocument(sourceId));
        await thunkAPI.dispatch(deleteLocalDocument(sourceId));
      }

      return thunkAPI.fulfillWithValue({ targetId });
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const syncLocalToCloud = createAsyncThunk(
  "app/syncLocalToCloud",
  async (
    payload: {
      id: string;
      localHead: string;
      updatedAt: string | Date;
      parentId?: string | null;
    },
    thunkAPI,
  ) => {
    try {
      const { id, localHead, updatedAt, parentId } = payload;

      const localDoc = await documentDB.getByID(id);
      if (!localDoc?.data) {
        return thunkAPI.rejectWithValue({
          title: "Sync failed",
          subtitle: "Local document not found",
        });
      }

      const revision = {
        id: localHead,
        documentId: id,
        data: localDoc.data,
        createdAt: updatedAt,
      };

      try {
        await thunkAPI.dispatch(createCloudRevision(revision)).unwrap();
      } catch (e) {
        return thunkAPI.rejectWithValue(e);
      }

      try {
        await thunkAPI.dispatch(
          updateCloudDocument({
            id,
            partial: { head: localHead, updatedAt, parentId },
          }),
        ).unwrap();
      } catch (e) {
        return thunkAPI.rejectWithValue(e);
      }

      return thunkAPI.fulfillWithValue(undefined);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const getDocumentById = createAsyncThunk(
  "app/getDocumentById",
  async (id: string, thunkAPI) => {
    try {
      const state = thunkAPI.getState() as AppState;
      const userDocument = state.documents.entities[id];
      if (!userDocument) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "document not found",
        });
      }
      return thunkAPI.fulfillWithValue(userDocument);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);
