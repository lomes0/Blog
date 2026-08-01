"use client";
import { IDB_KEY } from "./constants";
import { IndexedDBConfig } from "./interfaces";
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

      // Creates any store in the config the database does not already have.
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
