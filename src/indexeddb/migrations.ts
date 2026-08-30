"use client";
import type { IndexedDBMigration } from "./interfaces";

/**
 * Data migrations for a guest's local library.
 *
 * A signed-out browser's IndexedDB is the *only* copy of the drafts in it —
 * there is no server row to fall back on and no export anyone was asked to make
 * — so a schema change that reaches the shared `Post` type has to bring the
 * stored records with it. Renaming a field in TypeScript renames nothing on
 * disk: the records keep the old key, every reader gets `undefined`, and a
 * library that still has all its bytes reads as a library of untitled, empty,
 * unopenable posts.
 *
 * The record transforms are separated from the IndexedDB plumbing below and
 * exported on their own, so what a migration does to a record can be tested
 * without a browser — the same split `dragGeometry.ts` and `orderArray.ts` are
 * on.
 *
 * See docs/plans/schema-organization.md §B and §C for the two renames these
 * mirror.
 */

/** A stored record, before a migration has had a look at it. */
export type StoredRecord = Record<string, unknown>;

/**
 * Move one key's value to another, leaving the rest of the record alone.
 *
 * Absent-and-undefined are treated the same, and both leave the record
 * untouched rather than writing an explicit `undefined` — a record that already
 * went through this migration, or one written by a build that never had the old
 * key, must come out byte-identical, because the walker below writes back only
 * what changed.
 */
export const renameField = (
  record: StoredRecord,
  from: string,
  to: string,
): StoredRecord | null => {
  if (!(from in record)) return null;
  const { [from]: value, ...rest } = record;
  return value === undefined ? rest : { ...rest, [to]: value };
};

/** Drop one key, if the record still carries it. */
export const dropField = (
  record: StoredRecord,
  key: string,
): StoredRecord | null => {
  if (!(key in record)) return null;
  const { [key]: _dropped, ...rest } = record;
  return rest;
};

/**
 * v9 — `head` becomes `headRevisionId` (docs/plans/schema-organization.md §B).
 *
 * The cloud's half of this rename is a foreign key; the local half is a plain
 * string, because IndexedDB has no constraints to make it one. What the two
 * halves do share is the *name*, which is the whole reason this migration
 * exists: `Post` is one type across both backends, so a rename on one side is a
 * rename on the other.
 */
export const migrateDocumentToV9 = (record: StoredRecord) =>
  renameField(record, "head", "headRevisionId");

/**
 * v10 — `name` becomes `title`, and `background_image` goes
 * (docs/plans/schema-organization.md §C).
 *
 * The two travel together because they are one version bump, not because they
 * are related. `background_image` is dropped rather than carried forward under
 * a tidier name: the feature was removed and its bytes deleted
 * (docs/plans/blob-storage.md §10.2), so every value it could hold names a file
 * that does not exist.
 */
export const migrateDocumentToV10 = (record: StoredRecord) => {
  const renamed = renameField(record, "name", "title") ?? record;
  const dropped = dropField(renamed, "background_image");
  if (dropped) return dropped;
  return renamed === record ? null : renamed;
};

/**
 * v11 — the `type` discriminator goes
 * (docs/plans/schema-organization.md §D).
 *
 * It had one value. Leaving it in the stored records would leave the one place
 * a reader could still ask a question the model no longer has an answer to.
 */
export const migrateDocumentToV11 = (record: StoredRecord) =>
  dropField(record, "type");

// ─── IndexedDB plumbing ──────────────────────────────────────────────────────

/**
 * Replace an index, when the key it was over has been renamed.
 *
 * An index is part of the store's schema, so it can only be touched here, and
 * it has to be: an index on `name` over records that no longer have a `name` is
 * an index that matches nothing, and `getOneByKey("name", …)` would answer
 * "no such draft" for a draft that is sitting right there.
 */
const reindex = (
  tx: IDBTransaction,
  storeName: string,
  from: string,
  to: string,
  options?: IDBIndexParameters,
) => {
  if (!tx.db.objectStoreNames.contains(storeName)) return;
  const store = tx.objectStore(storeName);
  if (store.indexNames.contains(from)) store.deleteIndex(from);
  if (!store.indexNames.contains(to)) store.createIndex(to, to, options);
};

/**
 * Every data migration, in the order they are applied.
 *
 * Each entry's `version` is the version it brings the database *to*, so a
 * browser that has been away for three bumps applies all three in turn. Adding
 * one means bumping `version` in `./index.ts` to match — the list does not raise
 * it on its own, because the version is also what creates new stores.
 */
export const migrations: IndexedDBMigration[] = [
  {
    version: 9,
    description: "documents: head → headRevisionId",
    schema: (tx) => reindex(tx, "documents", "head", "headRevisionId"),
    records: { store: "documents", transform: migrateDocumentToV9 },
  },
  {
    version: 10,
    description: "documents: name → title, drop background_image",
    schema: (tx) => reindex(tx, "documents", "name", "title"),
    records: { store: "documents", transform: migrateDocumentToV10 },
  },
  {
    version: 11,
    description: "documents: drop type",
    records: { store: "documents", transform: migrateDocumentToV11 },
  },
];

/**
 * The one transform to run over each store, for an upgrade from `oldVersion` to
 * `newVersion`.
 *
 * Composition happens here rather than at the cursor, so that "what does this
 * upgrade do to a record?" is an ordinary function over plain objects and can
 * be answered in a spec — see `__tests__/migrations.test.ts`. `null` propagates
 * as "unchanged": a record none of the crossed versions had anything to say
 * about is not written back at all.
 */
export const recordTransformsFor = (
  oldVersion: number,
  newVersion: number,
  list: IndexedDBMigration[] = migrations,
): Map<string, (record: StoredRecord) => StoredRecord | null> => {
  const byStore = new Map<
    string,
    ((record: StoredRecord) => StoredRecord | null)[]
  >();
  for (const migration of list) {
    if (oldVersion >= migration.version) continue;
    if (migration.version > newVersion) continue;
    if (!migration.records) continue;
    const steps = byStore.get(migration.records.store) ?? [];
    steps.push(migration.records.transform);
    byStore.set(migration.records.store, steps);
  }
  return new Map(
    [...byStore].map(([store, steps]) => [
      store,
      (record: StoredRecord) => {
        let current = record;
        let changed = false;
        for (const step of steps) {
          const next = step(current);
          if (next) {
            current = next;
            changed = true;
          }
        }
        return changed ? current : null;
      },
    ]),
  );
};

/** The `schema` halves of the versions this upgrade crosses, in order. */
export const schemaStepsFor = (
  oldVersion: number,
  newVersion: number,
  list: IndexedDBMigration[] = migrations,
): IndexedDBMigration[] =>
  list.filter((m) =>
    oldVersion < m.version && m.version <= newVersion && m.schema
  );
