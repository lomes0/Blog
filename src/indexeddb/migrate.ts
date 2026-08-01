"use client";
import { getConnection } from "./idb";
import { IndexedDBConfig } from "./interfaces";
import {
  drainableKeys,
  planStoreCopy,
  selectMigratableStores,
  type StorePlan,
} from "./migrationPlan";

/** The database name inherited from the project this app was forked from. */
export const LEGACY_DATABASE_NAME = "matheditor";

/**
 * The stores whose contents exist nowhere else and outlive the session.
 *
 * Excluded on purpose:
 * - `attachmentContent` is a cache of file bodies the server still has. Copying
 *   it would be the slowest part of the migration and buys a cold fetch.
 * - `notesCanvas` is dead — notes moved to Postgres (`prisma.notesCanvas`,
 *   `/api/notes/*`) and nothing has read the store since. It is left untouched
 *   in the legacy database rather than copied or deleted, because this migration
 *   is not the place to decide whether pre-move notes are still owed to anyone.
 */
const MIGRATED_STORES = [
  "documents",
  "revisions",
  "copilotThreads",
  "pendingSaves",
] as const;

type NamedPlan = StorePlan & { store: string };

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Resolves when the transaction commits; rejects if it errors or aborts. */
function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

/**
 * Open the legacy database, or resolve `null` if there is nothing to migrate.
 *
 * There is no portable way to ask whether a database exists —
 * `indexedDB.databases()` is still uneven across browsers — so this opens
 * without a version and watches for `onupgradeneeded`, which only fires if the
 * open just created it. In that case the empty database it made is deleted
 * again, so probing leaves no trace.
 */
function openLegacyDatabase(): Promise<IDBDatabase | null> {
  return new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(LEGACY_DATABASE_NAME);
    let existed = true;
    request.onupgradeneeded = () => {
      existed = false;
    };
    request.onsuccess = () => {
      const db = request.result;
      if (existed) {
        resolve(db);
        return;
      }
      db.close();
      indexedDB.deleteDatabase(LEGACY_DATABASE_NAME);
      resolve(null);
    };
    request.onerror = () => resolve(null);
  });
}

/** Every string key held by each of `stores`. */
async function readKeys(
  db: IDBDatabase,
  stores: readonly string[],
): Promise<Record<string, string[]>> {
  const tx = db.transaction(stores as string[], "readonly");
  const entries = await Promise.all(
    stores.map(async (name) => {
      const keys = await promisify(tx.objectStore(name).getAllKeys());
      // Every store here is keyed by a string `id`. Anything else is left
      // behind rather than guessed at — it is never drained, so it is never
      // lost, and a store that somehow held one would simply be re-examined.
      return [
        name,
        keys.filter((key): key is string => typeof key === "string"),
      ] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * Write the planned records into the new database, and report what landed.
 *
 * Reads and writes are separate transactions because they are on separate
 * databases, so this cannot be atomic. The order is the safe one: a record is
 * only released from the legacy database after the write it belongs to has
 * committed, which makes the failure mode a duplicate attempt rather than a
 * lost draft.
 */
async function copyStores(
  legacy: IDBDatabase,
  target: IDBDatabase,
  plans: readonly NamedPlan[],
): Promise<Record<string, string[]>> {
  const names = plans.map((plan) => plan.store);

  const readTx = legacy.transaction(names, "readonly");
  const groups = await Promise.all(
    plans.map(async (plan) => {
      const store = readTx.objectStore(plan.store);
      const values = await Promise.all(
        plan.copy.map((key) => promisify(store.get(key))),
      );
      return { store: plan.store, keys: plan.copy, values };
    }),
  );

  const writeTx = target.transaction(names, "readwrite");
  const done = transactionDone(writeTx);
  const written: Record<string, string[]> = {};
  for (const group of groups) {
    const store = writeTx.objectStore(group.store);
    const landed: string[] = [];
    written[group.store] = landed;
    group.keys.forEach((key, index) => {
      const value = group.values[index];
      if (value === undefined) return;
      const request = store.add(value);
      request.onsuccess = () => {
        landed.push(key);
      };
      request.onerror = (event) => {
        // Most plausibly a ConstraintError from the unique `handle` index on
        // `documents`. Swallowing it keeps one bad record from aborting the
        // transaction and taking every other record down with it; the record
        // stays in the legacy database, unclaimed.
        event.preventDefault();
        event.stopPropagation();
        console.warn(
          `Could not migrate ${group.store}/${key}:`,
          request.error?.name ?? "unknown error",
        );
      };
    });
  }
  await done;
  return written;
}

/** Delete everything now known to be safely held by the new database. */
async function drainLegacy(
  legacy: IDBDatabase,
  plans: readonly NamedPlan[],
  written: Record<string, string[]>,
): Promise<void> {
  const work = plans
    .map((plan) => ({
      store: plan.store,
      keys: drainableKeys(plan, written[plan.store] ?? []),
    }))
    .filter((entry) => entry.keys.length > 0);
  if (work.length === 0) return;

  const tx = legacy.transaction(
    work.map((entry) => entry.store),
    "readwrite",
  );
  const done = transactionDone(tx);
  for (const entry of work) {
    const store = tx.objectStore(entry.store);
    for (const key of entry.keys) store.delete(key);
  }
  await done;
}

/**
 * Move what is left in the fork's old IndexedDB database into this one.
 *
 * Renaming an IndexedDB database migrates nothing — the name *is* the handle, so
 * a new one silently opens a second, empty database and strands every guest
 * draft in the old one. This is the copy that makes the rename safe.
 *
 * It runs on every boot, and is cheap once there is nothing left: one open, one
 * `getAllKeys` per store, close. That is deliberate rather than a one-shot with
 * a marker record. The app ships as a PWA, so a tab running a stale
 * service-worker bundle can keep writing to the old database after this code is
 * live; running every time picks those writes up on the next visit. Draining as
 * it goes is what stops a copy already deleted by the user from being
 * resurrected on the boot after that.
 *
 * Failure is not fatal: the caller logs and continues to open the new database,
 * because an app that starts with data still stranded beats one that does not
 * start.
 */
export async function migrateLegacyDatabase(
  config: IndexedDBConfig,
): Promise<void> {
  if (typeof window === "undefined" || !window.indexedDB) return;
  if (config.databaseName === LEGACY_DATABASE_NAME) return;

  const legacy = await openLegacyDatabase();
  if (!legacy) return;

  let target: IDBDatabase | undefined;
  try {
    const stores = selectMigratableStores(
      MIGRATED_STORES,
      Array.from(legacy.objectStoreNames),
      config.stores.map((store) => store.name),
    );
    if (stores.length === 0) return;

    const legacyKeys = await readKeys(legacy, stores);
    const active = stores.filter((name) => legacyKeys[name].length > 0);
    if (active.length === 0) return;

    target = await getConnection(config);
    const targetKeys = await readKeys(target, active);
    const plans: NamedPlan[] = active.map((name) => ({
      store: name,
      ...planStoreCopy(legacyKeys[name], targetKeys[name]),
    }));

    const pending = plans.filter((plan) => plan.copy.length > 0);
    const written = pending.length
      ? await copyStores(legacy, target, pending)
      : {};

    const total = Object.values(written).reduce(
      (count, keys) => count + keys.length,
      0,
    );
    if (total > 0) {
      console.warn(
        `Migrated ${total} record(s) from the "${LEGACY_DATABASE_NAME}" database into "${config.databaseName}".`,
      );
    }

    await drainLegacy(legacy, plans, written);
  } finally {
    legacy.close();
    target?.close();
  }
}
