"use client";
import { IDB_KEY } from "./constants";
import { getActions, getConnection } from "./idb";
import { IndexedDBConfig } from "./interfaces";
import { Post, Revision } from "@/types";
import type { SerializedEditorState } from "lexical";

export interface AttachmentContentCache {
  id: string; // filename
  url: string;
  content: string;
  mimetype: string;
  size: number;
  cachedAt: number; // timestamp
}

/**
 * An autosave that has not yet been confirmed by the backend — one record per
 * open post, keyed by post id.
 *
 * This is a resilience buffer for transient disconnects, not an offline store:
 * it is written on every autosave tick and cleared the moment the backend
 * acknowledges. A record surviving into the next session means the tab was
 * closed or crashed mid-save, and the editor restores from it on load.
 */
export interface PendingSave {
  id: string; // post id
  headId: string; // revision id this save would create
  data: SerializedEditorState;
  updatedAt: string;
}

async function setupIndexedDB(config: IndexedDBConfig) {
  return new Promise<void>(async (resolve, reject) => {
    try {
      await getConnection(config);
      window[IDB_KEY] = { init: 1, config };
      resolve();
    } catch (e) {
      console.error(e);
      reject(e);
    }
  });
}

export function getStore<T>(storeName: string) {
  return getActions<T>(storeName);
}

const idbConfig = {
  // The name is the handle for the browser's IndexedDB store, so changing it
  // migrates nothing on its own — it opens a second, empty database and strands
  // every draft in the old one. Renaming this would need a copy written first,
  // the way the fork's old database was carried over in Aug 2026; that copy was
  // retired once every profile had been swept, so there is nothing left to
  // follow this one. See `docs/plans/archive/legacy-idb-retirement.md`.
  databaseName: "blog-simple",
  // 8 adds `orders`; 7 added `workspaces`; 6 added `copilotThreads`. Bumping
  // the version is what runs `onupgradeneeded`, which creates any store in this
  // list the database does not already have — existing stores and their
  // contents are untouched.
  version: 8,
  stores: [
    {
      name: "documents",
      id: { keyPath: "id" },
      indices: [
        {
          name: "handle",
          keyPath: "handle",
          options: { unique: true },
        },
        { name: "name", keyPath: "name" },
        { name: "data", keyPath: "data" },
        { name: "createdAt", keyPath: "createdAt" },
        { name: "updatedAt", keyPath: "updatedAt" },
        { name: "baseId", keyPath: "baseId" },
        { name: "head", keyPath: "head" },
      ],
    },
    {
      name: "revisions",
      id: { keyPath: "id" },
      indices: [
        { name: "documentId", keyPath: "documentId" },
        { name: "createdAt", keyPath: "createdAt" },
      ],
    },
    // No `notesCanvas`: notes live in Postgres (`prisma.notesCanvas`,
    // `/api/notes/*`) and nothing has read the local store since that move, so
    // the new database does not recreate it. Whatever the legacy database holds
    // is left there — see `MIGRATED_STORES`.
    {
      name: "attachmentContent",
      id: { keyPath: "id" },
      indices: [
        { name: "url", keyPath: "url", options: { unique: true } },
        { name: "cachedAt", keyPath: "cachedAt" },
      ],
    },
    {
      name: "pendingSaves",
      id: { keyPath: "id" },
      indices: [{ name: "updatedAt", keyPath: "updatedAt" }],
    },
    {
      // Copilot conversations for a signed-out session. The signed-in half
      // lives in Postgres; `threadBackendFor` picks between them.
      name: "copilotThreads",
      id: { keyPath: "id" },
      indices: [
        { name: "scope", keyPath: "scope" },
        { name: "updatedAt", keyPath: "updatedAt" },
      ],
    },
    {
      // What is open, per user (plan §8.2). One record, id = the user's id or
      // `"guest"` — a layout is a fact about a device, so unlike posts and
      // threads this one has no cloud half to sync with.
      name: "workspaces",
      id: { keyPath: "id" },
      indices: [{ name: "updatedAt", keyPath: "updatedAt" }],
    },
    {
      // A guest's container order arrays
      // (docs/plans/archive/ordering-simplification.md §7), keyed by container.
      // Today that is exactly one record — `"root"` — because the only other
      // local container is a tabbed post, whose order lives on the post record
      // itself as `tabOrder`, exactly as it lives on the `Document` row in the
      // cloud. Root is the one container with no row of its own to hang an
      // array on: the cloud puts it on `User`, and IndexedDB has no user.
      name: "orders",
      id: { keyPath: "id" },
      indices: [],
    },
  ],
};

if (typeof window !== "undefined") {
  setupIndexedDB(idbConfig).catch(console.error);
}
export const documentDB = getStore<Post>("documents");
export const revisionDB = getStore<Revision>("revisions");
export const attachmentContentDB = getStore<AttachmentContentCache>(
  "attachmentContent",
);
export const pendingSaveDB = getStore<PendingSave>("pendingSaves");

/** One local container's order: `id` is the container, `ids` its children. */
export interface LocalOrder {
  id: string;
  ids: string[];
}

export const orderDB = getStore<LocalOrder>("orders");
