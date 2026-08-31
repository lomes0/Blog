"use client";
interface IndexedDBColumn {
  name: string;
  keyPath: string;
  options?: IDBIndexParameters;
}

export interface IndexedDBStore {
  name: string;
  id: IDBObjectStoreParameters;
  indices: IndexedDBColumn[];
}

/**
 * A rewrite of what is already stored, run when the database is opened at a
 * higher version than the one on disk.
 *
 * Creating a store is not a migration and does not belong here — the opener
 * creates any store in `stores` the database lacks, and leaves existing ones
 * alone. This is for the other case: a field a store's records already carry
 * has been renamed or dropped, so the records themselves have to be rewritten
 * and any index over the old key replaced. A guest's drafts are the only copy
 * that exists (docs/plans/schema-organization.md §B, §C), so a version bump
 * that leaves them unreadable loses them outright.
 *
 * It runs inside `onupgradeneeded`'s own `versionchange` transaction — the one
 * transaction that may touch schema and data together — which is why it is
 * handed the transaction rather than opening one. It must therefore be
 * synchronous in the IndexedDB sense: issue requests and let their callbacks
 * chain, never `await` something outside the store, or the transaction commits
 * out from under it.
 */
export interface IndexedDBMigration {
  /**
   * The version this migration brings the database *to*. It applies when the
   * database is being opened at or above this version and was previously below
   * it — so an upgrade across several versions applies each in turn, in order.
   */
  version: number;
  /** What it is for, in a few words, for the console when it fails. */
  description: string;
  /**
   * Index and store work: anything that changes the shape rather than the
   * contents. Applied immediately, in version order.
   */
  schema?: (tx: IDBTransaction) => void;
  /**
   * How this version rewrites one store's records. `null` from `transform`
   * means "this record is already right", and skips the write.
   *
   * Declared rather than performed, and this is the point: the transforms of
   * every version being crossed are **composed into one pass** per store. Two
   * cursors open on the same store at the same time each read the record as it
   * was when they reached it, so each would write back the original plus its
   * own change and the last one would win — an upgrade across three versions
   * would apply exactly one of them, silently, and the other two would appear
   * to have worked because the index changes beside them did.
   */
  records?: {
    store: string;
    transform: (record: Record<string, unknown>) => Record<string, unknown> | null;
  };
}

export interface IndexedDBConfig {
  databaseName: string;
  version: number;
  stores: IndexedDBStore[];
  /**
   * Data migrations, applied in ascending `version` order. See
   * {@link IndexedDBMigration} for why creating a store is not one of these.
   */
  migrations?: IndexedDBMigration[];
}
