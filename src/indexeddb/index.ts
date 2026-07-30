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
  databaseName: "matheditor",
  version: 5,
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
    {
      name: "notesCanvas",
      id: { keyPath: "id" },
      indices: [
        { name: "name", keyPath: "name" },
        { name: "createdAt", keyPath: "createdAt" },
        { name: "updatedAt", keyPath: "updatedAt" },
      ],
    },
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

