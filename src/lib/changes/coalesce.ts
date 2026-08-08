/**
 * Event coalescing for the live feed — docs/plans/changes_detection.md §8.
 *
 * Import-free apart from its own types, like `diff.ts` and `emitter.ts`, and for
 * the same reason: this is the whole of what the SSE client decides on its own,
 * and §8 lists it as one of the three testable pieces of the feature ("N
 * notifications for the same id inside one window collapse to one refresh").
 * The hook around it (`hooks/useChangeFeed.ts`) is then only wiring —
 * `EventSource` in, dispatches out — and needs a browser to exercise, which is
 * exactly the split the repo already uses for `dragGeometry.ts`.
 *
 * ## Why coalesce at all
 *
 * An agent `apply_ops` run is not one write. A batch lands a proposal, a save
 * moves the document, an approval moves `head` and emits again — and the MCP
 * server can run several batches back to back, each announcing itself the
 * instant its transaction commits. Every event carries ids and no content
 * (§10), so acting on one means a fetch; acting on each of a burst means a
 * fetch per event for a row whose final state one fetch would have given.
 *
 * ## A fixed window, not a resetting debounce
 *
 * The window opens on the first event of a batch and closes `windowMs` later,
 * whatever arrives in between. The obvious alternative — restart the timer on
 * every event — has a failure mode this does not: a steady stream of events
 * spaced closer than the window never flushes at all, so a long agent run would
 * show the user nothing until it stopped. A fixed window bounds the delay at
 * `windowMs` regardless of arrival rate.
 *
 * ## Folding rules
 *
 * One entry per document id, last event wins, because these are statements
 * about a row rather than a log of what happened to it:
 *
 * - a document event marks its id for re-fetch;
 * - a `document.deleted` replaces any pending re-fetch of that id — there is
 *   nothing left to fetch — and a create arriving after a delete replaces it
 *   back, which is what makes "last wins" the honest rule rather than a
 *   precedence table;
 * - proposal events set one flag. They name a revision, not a row the store
 *   holds, and the response to any number of them is the same single
 *   `refreshProposals()` (§3.2, §4: the feed triggers the existing proposal
 *   path, it does not duplicate it).
 */

import type { ChangeEvent } from "./events";

/**
 * How long a batch stays open, in ms.
 *
 * Short enough that a single write still feels immediate — §1.2 asks for "a
 * couple of seconds", and this is two orders of magnitude inside that — and
 * long enough to swallow the several events one `apply_ops` transaction emits
 * at commit.
 */
export const COALESCE_WINDOW_MS = 300;

/** What one window collapsed to. Empty batches are never emitted. */
export interface ChangeBatch {
  /** Documents to re-fetch: created or updated. */
  changedIds: string[];
  /** Documents the feed says are gone. */
  deletedIds: string[];
  /** At least one proposal was written or resolved. */
  proposals: boolean;
}

/**
 * Cancels a scheduled flush. Returned by {@link ChangeBatcherOptions.schedule}
 * rather than taking a handle back, so the timer's type never has to be named —
 * `setTimeout` is a `number` in the browser's lib and a `Timeout` in Node's, and
 * this module is imported by code type-checked under both.
 */
export type CancelScheduled = () => void;

export interface ChangeBatcherOptions {
  /** Called once per window, with a batch that is never empty. */
  onFlush: (batch: ChangeBatch) => void;
  /** Defaults to {@link COALESCE_WINDOW_MS}. */
  windowMs?: number;
  /**
   * Defaults to `setTimeout`. Injectable only so the window is assertable
   * without fake timers — production never passes it.
   */
  schedule?: (run: () => void, ms: number) => CancelScheduled;
}

export interface ChangeBatcher {
  /** Fold one event into the open window, opening one if none is. */
  push(event: ChangeEvent): void;
  /** Flush now if anything is pending. A no-op otherwise. */
  flush(): void;
  /**
   * Drop whatever is pending and cancel the timer. For effect teardown: a
   * flush after the stream is gone would dispatch into an unmounted tree.
   */
  cancel(): void;
  /** Whether a window is open. For teardown assertions. */
  readonly pending: boolean;
}

type Mark = "changed" | "deleted";

const defaultSchedule = (run: () => void, ms: number): CancelScheduled => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

export function createChangeBatcher(
  options: ChangeBatcherOptions,
): ChangeBatcher {
  const {
    onFlush,
    windowMs = COALESCE_WINDOW_MS,
    schedule = defaultSchedule,
  } = options;

  // Insertion-ordered, so a batch comes out in the order the ids were first
  // mentioned and the result is deterministic to assert. Re-setting an existing
  // key keeps its position, which is what makes "last wins" cheap.
  const marks = new Map<string, Mark>();
  let proposals = false;
  let cancelScheduled: CancelScheduled | null = null;

  const reset = () => {
    marks.clear();
    proposals = false;
    if (cancelScheduled) {
      cancelScheduled();
      cancelScheduled = null;
    }
  };

  const flush = () => {
    if (!marks.size && !proposals) return;
    const changedIds: string[] = [];
    const deletedIds: string[] = [];
    for (const [id, mark] of marks) {
      (mark === "deleted" ? deletedIds : changedIds).push(id);
    }
    const batch: ChangeBatch = { changedIds, deletedIds, proposals };
    // Cleared *before* the callback: `onFlush` dispatches, and a dispatch can
    // synchronously produce another event on a slow enough machine. Anything
    // arriving from inside the flush belongs to the next window, not this one.
    reset();
    onFlush(batch);
  };

  return {
    push(event) {
      switch (event.kind) {
        case "document.deleted":
          marks.set(event.id, "deleted");
          break;
        case "document.created":
        case "document.updated":
          marks.set(event.id, "changed");
          break;
        case "proposal.upserted":
        case "proposal.resolved":
          // Deliberately not marking `event.id` as changed. An approval moves
          // `Document.head`, but the emitter sends the `document.updated` for
          // that itself (see `events.ts`), so inferring one from the other here
          // would double-fetch — and a mere `proposal.upserted` moves nothing
          // in the document table at all (§3.2).
          proposals = true;
          break;
      }
      if (!cancelScheduled) cancelScheduled = schedule(flush, windowMs);
    },

    flush,
    cancel: reset,

    get pending() {
      return marks.size > 0 || proposals;
    },
  };
}
