/**
 * Which blobs may be collected — docs/plans/blob-storage.md §5, phase 5.
 *
 * Content addressing without collection is a leak with extra steps, and a
 * collector is the one job in this app that deletes user data on its own
 * initiative. So the rule it acts on lives here, in one place, with no database
 * and no clock of its own: `now` is a parameter for the same reason
 * `planBlobRefs` takes one, and the specs in
 * `src/lib/__tests__/blobGc.test.ts` drive the whole window without faking
 * timers.
 *
 * Import-free on purpose, like `blobRefs.ts` and `dragGeometry.ts`. It matters
 * more here than anywhere else this convention is applied: the alternative — the
 * rule expressed as a `where` clause in the collector's query — is a second
 * spelling of the one condition that must not drift, and §13 has already ruled
 * on what that costs once (a blob collected while it is still in use). The
 * collector therefore reads *every* blob with its reference count and asks this
 * module, rather than asking Postgres for "the collectable ones".
 */

/** A `Blob` row, as much of one as the decision needs. */
export interface BlobCandidate {
  hash: string;
  size: number;
  /** When the **bytes** arrived, which is not when the last reference left. */
  createdAt: Date;
  /** How many `BlobRef` rows point at it right now. */
  refCount: number;
}

/**
 * How long a blob is kept after it stops being referenced by anything.
 *
 * **Seven days**, and it is a second window rather than a longer version of the
 * first. `BLOB_REF_GRACE_MS` (24 h, §3.2) protects a *reference* from being
 * revoked during the gap between pasting an image and saving the document. This
 * one protects a *blob* that has no reference at all — a different state, which
 * the reference grace cannot reach, because there is nothing there for it to
 * hold on to.
 *
 * That state is ordinary, not exceptional. Three paths in this codebase store
 * bytes and record the `Blob` row *before* any document can reference them:
 *
 * - `ingestInlineBlobs` — a guest draft signing in. The blob row is written
 *   while the document it belongs to does not exist yet, and the reference only
 *   appears when `reconcileDocumentBlobs` runs after the create.
 * - `/api/import` — restores every blob in a bundle, then reconciles per
 *   document afterwards, for the same reason.
 * - `prisma/scripts/migrate-blobs.ts` — bytes first, rows second, by design.
 *
 * In each, a collector running in the gap would take bytes that a
 * half-committed write is about to name. The window has to be long enough that
 * "the gap" means an *operator's* timescale and not a request's, because the way
 * these gaps actually get long is that the batch job died and a person has to
 * re-run it. A day does not survive a Friday-evening import failure. A week
 * does, and a week is also comfortably longer than any plausible interval
 * between scheduled runs, so a blob orphaned just after one run is not collected
 * by the next before anyone could have noticed.
 *
 * It must in any case exceed `BLOB_REF_GRACE_MS`, or it is not a window at all:
 * a blob is always at least as old as its youngest reference, so a 24 h blob
 * window measured from `createdAt` would already have expired at the instant the
 * reference grace released the last reference, and the collector would be
 * running with no margin of its own. `blobGc.test.ts` asserts that ordering so
 * that shortening this constant fails rather than quietly disarming it.
 *
 * The asymmetry decides the number, as it does everywhere else in this plan.
 * Holding too long costs storage on bytes that are already deduplicated ~25×
 * (§1) — the 13.6 MB this whole design reclaimed was 553 kB of distinct
 * content. Releasing too early destroys user work by way of a bookkeeping job,
 * which §3.1 names as the one outcome this mechanism must not produce. There is
 * no symmetric argument to balance against, so the window is set by what the
 * slow side needs and not by what the storage bill prefers.
 *
 * This answers the half of §13's grace-period question that §3.2 left open.
 */
export const BLOB_GC_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The rule, whole — §5: zero references *and* older than the window.
 *
 * `<` rather than `<=`, so a blob exactly on the boundary is kept. Matches
 * `planBlobRefs`, and the direction of the rounding is the safe one.
 */
export function isCollectable(
  blob: BlobCandidate,
  now: Date,
  graceMs: number = BLOB_GC_GRACE_MS,
): boolean {
  return blob.refCount === 0 &&
    blob.createdAt.getTime() < now.getTime() - graceMs;
}

/** Why a blob was left alone. Reported, not inferred — see the plan below. */
export type KeepReason = "referenced" | "within-grace";

export interface KeptBlob {
  blob: BlobCandidate;
  reason: KeepReason;
}

export interface BlobCollectionPlan {
  /** Oldest first. */
  collect: BlobCandidate[];
  keep: KeptBlob[];
  /** Bytes the run would reclaim, i.e. the sum over `collect` alone. */
  bytes: number;
}

/**
 * Sort every candidate into collect-or-keep, and say why for each keep.
 *
 * The reasons are the point of returning a plan rather than a filtered list.
 * §5's standing requirement is that this job be loud — "a GC that silently
 * removes user data is the one job that must be loud" — and being loud about
 * what it *took* is only half of it. An operator looking at a store that is not
 * shrinking needs to see whether the bytes are still referenced or merely young,
 * because those two have completely different remedies, and a boolean filter
 * throws that distinction away at exactly the moment it is wanted.
 *
 * `referenced` wins over `within-grace` when both apply: a referenced blob is
 * not waiting on anything, and reporting it as a timer that will one day expire
 * would be false.
 *
 * Oldest first, then by hash. The oldest orphan is the one worth looking at, and
 * a total order means two dry runs of an unchanged store print identical output
 * — which is what makes the log diffable and a surprising line visible.
 */
export function planBlobCollection(
  candidates: readonly BlobCandidate[],
  now: Date,
  graceMs: number = BLOB_GC_GRACE_MS,
): BlobCollectionPlan {
  const collect: BlobCandidate[] = [];
  const keep: KeptBlob[] = [];

  for (const blob of candidates) {
    if (isCollectable(blob, now, graceMs)) {
      collect.push(blob);
    } else {
      keep.push({
        blob,
        reason: blob.refCount > 0 ? "referenced" : "within-grace",
      });
    }
  }

  const byAge = (a: BlobCandidate, b: BlobCandidate) =>
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.hash.localeCompare(b.hash);

  collect.sort(byAge);
  keep.sort((a, b) => byAge(a.blob, b.blob));

  return {
    collect,
    keep,
    bytes: collect.reduce((sum, blob) => sum + blob.size, 0),
  };
}

/** How long a blob has existed, in ms. Never negative, so a clock skew reads as 0. */
export function ageOf(blob: BlobCandidate, now: Date): number {
  return Math.max(0, now.getTime() - blob.createdAt.getTime());
}

/**
 * An age a person can read at a glance.
 *
 * Lives here rather than in the script because it is part of what §5 asks the
 * collector to say about each blob it takes, and a log line that is part of the
 * contract deserves a spec. One unit, never two: the reader is deciding whether
 * a number looks wrong, and "8d" answers that as well as "8d 3h 12m" while
 * staying the same width down the column.
 */
export function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
