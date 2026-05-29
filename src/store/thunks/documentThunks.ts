import { createAsyncThunk } from "@reduxjs/toolkit";
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
import { validate } from "uuid";
import { createCloudRevision } from "./revisionThunks";

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
