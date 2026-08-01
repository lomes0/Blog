/**
 * The decisions behind the one-time copy out of the fork's old IndexedDB
 * database and into this app's — see `migrateLegacyDatabase`.
 *
 * Deliberately import-free so it can be exercised without a browser: everything
 * here is set arithmetic over key lists, and the parts that need a real
 * `IDBDatabase` live next door in `migrate.ts`.
 */

/** What to do with one store's worth of legacy keys. */
export interface StorePlan {
  /** Keys present in the legacy database and absent from the new one. */
  copy: string[];
  /**
   * Keys the new database already has. Nothing to copy, and safe to delete from
   * the legacy database — leaving them there would mean re-examining them on
   * every boot forever.
   */
  drain: string[];
}

/**
 * Split a store's legacy keys into "needs copying" and "already there".
 *
 * The diff is what makes the migration idempotent, so it can run on every boot
 * until the legacy database is empty. That matters more than it sounds: the app
 * ships as a PWA, so a tab holding a stale service-worker bundle can still be
 * writing to the old database after the new code is live. Those writes are
 * picked up by the next boot rather than lost.
 *
 * Order is preserved so a failed run retries in the same sequence.
 */
export function planStoreCopy(
  legacyKeys: readonly string[],
  targetKeys: Iterable<string>,
): StorePlan {
  const present = new Set(targetKeys);
  const copy: string[] = [];
  const drain: string[] = [];
  const seen = new Set<string>();
  for (const key of legacyKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    (present.has(key) ? drain : copy).push(key);
  }
  return { copy, drain };
}

/**
 * The stores worth copying that both databases actually have.
 *
 * The legacy database is at version 5, so it predates `copilotThreads` (6) and
 * `workspaces` (7) and simply will not contain them. Intersecting rather than
 * assuming is also what keeps this honest if a store is later renamed or
 * dropped from the config.
 */
export function selectMigratableStores(
  wanted: readonly string[],
  legacyStores: Iterable<string>,
  targetStores: Iterable<string>,
): string[] {
  const inLegacy = new Set(legacyStores);
  const inTarget = new Set(targetStores);
  return wanted.filter((name) => inLegacy.has(name) && inTarget.has(name));
}

/**
 * Keys that may be deleted from the legacy database after a write pass.
 *
 * A record is only released once it is known to be in the new database — either
 * it was already there (`drain`) or this run just wrote it (`copied`). A record
 * whose write failed stays put, so the worst case is a retry rather than a lost
 * draft.
 */
export function drainableKeys(
  plan: StorePlan,
  copied: Iterable<string>,
): string[] {
  const written = new Set(copied);
  return [...plan.drain, ...plan.copy.filter((key) => written.has(key))];
}
