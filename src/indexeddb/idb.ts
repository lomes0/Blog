"use client";
import { IDB_KEY } from "./constants";
import { IndexedDBConfig } from "./interfaces";
import { recordTransformsFor, schemaStepsFor } from "./migrations";
import { waitUntil } from "./utils";

declare global {
  interface Window {
    [IDB_KEY]: {
      config: IndexedDBConfig;
      init: number;
    };
  }
}

function validateStore(db: IDBDatabase, storeName: string) {
  return db.objectStoreNames.contains(storeName);
}

export function validateBeforeTransaction(
  db: IDBDatabase | undefined,
  storeName: string,
  reject: (reason: string) => void,
) {
  if (!db) {
    return reject("Queried before opening connection");
  }
  if (!validateStore(db, storeName)) {
    reject(`Store ${storeName} not found`);
  }
}

export function commitTransaction(tx: IDBTransaction): void {
  (tx as IDBTransaction & { commit?: () => void }).commit?.();
}

export function createTransaction(
  db: IDBDatabase,
  dbMode: IDBTransactionMode,
  currentStore: string,
  resolve: (() => void) | null,
  reject?: ((reason?: unknown) => void) | null,
  abort?: (() => void) | null,
): IDBTransaction {
  let tx: IDBTransaction = db.transaction(currentStore, dbMode);
  tx.onerror = reject
    ? (ev: Event) => reject((ev.target as IDBTransaction).error)
    : null;
  tx.oncomplete = resolve ? () => resolve() : null;
  tx.onabort = abort ? () => abort() : null;
  return tx;
}

export async function getConnection(
  config?: IndexedDBConfig,
): Promise<IDBDatabase> {
  const idbInstance = typeof window !== "undefined" ? window.indexedDB : null;
  let _config: IndexedDBConfig = config!;

  if (!config && idbInstance) {
    await waitUntil(() => window?.[IDB_KEY]?.["init"] === 1);
    _config = window[IDB_KEY]?.["config"];
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    if (idbInstance) {
      const request: IDBOpenDBRequest = idbInstance.open(
        _config.databaseName,
        _config.version,
      );

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error?.name ?? "Unknown error");
      };

      // Creates any store in the config the database does not already have,
      // then runs whatever data migrations the version jump crossed.
      // It does not resolve: `onsuccess` always fires after the upgrade
      // transaction commits, and resolving here handed the caller a connection
      // that had just been closed. Nothing noticed, because the only caller on
      // the creating path is `setupIndexedDB`, which discards the connection —
      // but the migration does use the one it is given.
      request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
        const db = (e.target as IDBOpenDBRequest).result;
        _config.stores.forEach((s) => {
          if (!db.objectStoreNames.contains(s.name)) {
            const store = db.createObjectStore(s.name, s.id);
            s.indices.forEach((c) => {
              store.createIndex(c.name, c.keyPath, c.options);
            });
          }
        });

        // `oldVersion === 0` is a database being created, not upgraded: the
        // stores above were just made from the current config and hold nothing,
        // so there is nothing for a migration to rewrite and running one would
        // only be a chance to get it wrong.
        if (e.oldVersion === 0) return;

        // `request.transaction` is the `versionchange` transaction — the only
        // one that may touch schema and data in the same breath, and the reason
        // a rename of a stored field and of the index over it commit together
        // or not at all. A migration that throws aborts it, which leaves the
        // database at its old version with its records untouched: the next open
        // tries again rather than leaving a guest with a half-renamed library.
        const tx = request.transaction;
        if (!tx || !_config.migrations?.length) return;
        const migrations = _config.migrations;

        try {
          // Schema first, in version order: an index has to exist over the key
          // the records are about to be given.
          for (
            const migration of schemaStepsFor(
              e.oldVersion,
              _config.version,
              migrations,
            )
          ) {
            migration.schema!(tx);
          }

          // Then **one** cursor pass per store, over the composed transform of
          // every version being crossed. One pass rather than one per version,
          // because two cursors open on the same store each hold the record as
          // they found it: they would take turns writing back the original plus
          // their own change, and the survivor would be whichever finished
          // last. That is not a hypothetical — it is what a v8 profile did on
          // the first run of this, applying the third rename and losing the
          // other two while the index changes beside them succeeded, so it
          // looked like it had worked.
          for (
            const [storeName, transform] of recordTransformsFor(
              e.oldVersion,
              _config.version,
              migrations,
            )
          ) {
            if (!db.objectStoreNames.contains(storeName)) continue;
            const cursorRequest = tx.objectStore(storeName).openCursor();
            cursorRequest.onsuccess = () => {
              const cursor = cursorRequest.result;
              if (!cursor) return;
              const next = transform(cursor.value as Record<string, unknown>);
              if (next) cursor.update(next);
              cursor.continue();
            };
          }
        } catch (error) {
          console.error("[idb] upgrade failed", error);
          throw error;
        }
      };
    } else {
      reject("Failed to connect");
    }
  });
}

export function getActions<T>(currentStore: string) {
  return {
    getByID(id: string | number) {
      return new Promise<T>((resolve, reject) => {
        getConnection()
          .then((db) => {
            validateBeforeTransaction(db, currentStore, reject);
            let tx = createTransaction(
              db,
              "readonly",
              currentStore,
              null,
              reject,
            );
            let objectStore = tx.objectStore(currentStore);
            let request = objectStore.get(id);
            request.onsuccess = () => {
              resolve(request.result as T);
            };
          })
          .catch(reject);
      });
    },
    getOneByKey(keyPath: string, value: string | number) {
      return new Promise<T | undefined>((resolve, reject) => {
        getConnection()
          .then((db) => {
            validateBeforeTransaction(db, currentStore, reject);
            let tx = createTransaction(
              db,
              "readonly",
              currentStore,
              null,
              reject,
            );
            let objectStore = tx.objectStore(currentStore);
            let index = objectStore.index(keyPath);
            let request = index.get(value);
            request.onsuccess = () => {
              resolve(request.result);
            };
          })
          .catch(reject);
      });
    },
    getManyByKey(keyPath: string, value: string | number) {
      return new Promise<T[]>((resolve, reject) => {
        getConnection()
          .then((db) => {
            validateBeforeTransaction(db, currentStore, reject);
            let tx = createTransaction(
              db,
              "readonly",
              currentStore,
              null,
              reject,
            );
            let objectStore = tx.objectStore(currentStore);
            let index = objectStore.index(keyPath);
            let request = index.getAll(value);
            request.onsuccess = () => {
              resolve(request.result);
            };
          })
          .catch(reject);
      });
    },
    getAll() {
      return new Promise<T[]>((resolve, reject) => {
        getConnection()
          .then((db) => {
            validateBeforeTransaction(db, currentStore, reject);
            let tx = createTransaction(
              db,
              "readonly",
              currentStore,
              null,
              reject,
            );
            let objectStore = tx.objectStore(currentStore);
            let request = objectStore.getAll();
            request.onsuccess = () => {
              resolve(request.result as T[]);
            };
          })
          .catch(reject);
      });
    },

    add(value: T, key?: IDBValidKey) {
      return new Promise<IDBValidKey>((resolve, reject) => {
        getConnection()
          .then((db) => {
            validateBeforeTransaction(db, currentStore, reject);
            let tx = createTransaction(
              db,
              "readwrite",
              currentStore,
              null,
              reject,
            );
            let objectStore = tx.objectStore(currentStore);
            let request = objectStore.add(value, key);
            request.onsuccess = () => {
              commitTransaction(tx);
              resolve(request.result);
            };
          })
          .catch(reject);
      });
    },

    addMany(values: T[], keys?: IDBValidKey[]) {
      return new Promise<IDBValidKey[]>((resolve, reject) => {
        getConnection()
          .then((db) => {
            validateBeforeTransaction(db, currentStore, reject);
            let tx = createTransaction(
              db,
              "readwrite",
              currentStore,
              null,
              reject,
            );
            let objectStore = tx.objectStore(currentStore);
            const results: IDBValidKey[] = [];
            values.forEach((value, i) => {
              let request = objectStore.put(value, keys?.[i]);
              request.onsuccess = () => {
                results.push(request.result);
                if (i === values.length - 1) {
                  commitTransaction(tx);
                  resolve(results);
                }
              };
            });
          })
          .catch(reject);
      });
    },

    update(value: T, key?: IDBValidKey) {
      return new Promise<IDBValidKey>((resolve, reject) => {
        getConnection()
          .then((db) => {
            validateBeforeTransaction(db, currentStore, reject);
            let tx = createTransaction(
              db,
              "readwrite",
              currentStore,
              null,
              reject,
            );
            let objectStore = tx.objectStore(currentStore);
            let request = objectStore.put(value, key);
            request.onsuccess = () => {
              commitTransaction(tx);
              resolve(request.result);
            };
          })
          .catch(reject);
      });
    },

    patch(id: string | number, value: Partial<T>) {
      return new Promise<IDBValidKey>((resolve, reject) => {
        this.getByID(id).then((data) => {
          if (data) {
            const updatedData = { ...data, ...value };
            this.update(updatedData).then(resolve).catch(reject);
          } else {
            reject("Not found");
          }
        }).catch(reject);
      });
    },

    deleteByID(id: IDBValidKey) {
      return new Promise<void>((resolve, reject) => {
        getConnection()
          .then((db) => {
            validateBeforeTransaction(db, currentStore, reject);
            let tx = createTransaction(
              db,
              "readwrite",
              currentStore,
              null,
              reject,
            );
            let objectStore = tx.objectStore(currentStore);
            let request = objectStore.delete(id);
            request.onsuccess = () => {
              commitTransaction(tx);
              resolve();
            };
          })
          .catch(reject);
      });
    },
    deleteManyByKey(keyPath: string, value: string | number) {
      return new Promise<void>((resolve, reject) => {
        getConnection()
          .then((db) => {
            validateBeforeTransaction(db, currentStore, reject);
            let tx = createTransaction(
              db,
              "readwrite",
              currentStore,
              null,
              reject,
            );
            let objectStore = tx.objectStore(currentStore);
            let index = objectStore.index(keyPath);
            let request = index.openCursor(value);
            request.onsuccess = () => {
              const cursor = request.result;
              if (cursor) {
                cursor.delete();
                cursor.continue();
              } else {
                commitTransaction(tx);
                resolve();
              }
            };
          })
          .catch(reject);
      });
    },
    deleteAll() {
      return new Promise<void>((resolve, reject) => {
        getConnection()
          .then((db) => {
            validateBeforeTransaction(db, currentStore, reject);
            let tx = createTransaction(
              db,
              "readwrite",
              currentStore,
              null,
              reject,
            );
            let objectStore = tx.objectStore(currentStore);
            let request = objectStore.clear();
            request.onsuccess = () => {
              commitTransaction(tx);
              resolve();
            };
          })
          .catch(reject);
      });
    },

    openCursor(cursorCallback: (e: Event) => void, keyRange?: IDBKeyRange) {
      return new Promise<IDBCursorWithValue | void>((resolve, reject) => {
        getConnection()
          .then((db) => {
            validateBeforeTransaction(db, currentStore, reject);
            let tx = createTransaction(
              db,
              "readonly",
              currentStore,
              null,
              reject,
            );
            let objectStore = tx.objectStore(currentStore);
            let request = objectStore.openCursor(keyRange);
            request.onsuccess = (e) => {
              cursorCallback(e);
              resolve();
            };
          })
          .catch(reject);
      });
    },
  };
}
