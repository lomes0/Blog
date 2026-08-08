import {
  type ChangeBatch,
  COALESCE_WINDOW_MS,
  createChangeBatcher,
} from "@/lib/changes/coalesce";
import type { ChangeEvent } from "@/lib/changes/events";

/**
 * Event coalescing — docs/plans/changes_detection.md §8's second testable
 * claim: "N notifications for the same id inside one window collapse to one
 * refresh".
 *
 * The stream that feeds it is not testable here (§8 verifies `EventSource` by
 * hand), which is why the folding rules live in an import-free module. What is
 * asserted is the whole of what the client decides on its own: how many
 * fetches a burst costs, and what a delete does to a re-fetch already queued
 * behind it.
 */

/** A controllable clock, so the window is asserted rather than waited out. */
const clock = () => {
  let pending: { run: () => void; ms: number } | null = null;
  return {
    schedule: (run: () => void, ms: number) => {
      pending = { run, ms };
      return () => {
        pending = null;
      };
    },
    /** The delay the batcher asked for, or `null` if it asked for nothing. */
    get delay() {
      return pending?.ms ?? null;
    },
    fire() {
      const current = pending;
      pending = null;
      current?.run();
    },
  };
};

const doc = (
  id: string,
  kind: "document.created" | "document.updated" | "document.deleted" =
    "document.updated",
): ChangeEvent => ({ kind, id, authorId: "alice", origin: "claude-code" });

const proposal = (id: string): ChangeEvent => ({
  kind: "proposal.upserted",
  id,
  authorId: "alice",
  origin: "claude-code",
  revisionId: `${id}-rev`,
});

const batcherWith = (timer: ReturnType<typeof clock>, windowMs?: number) => {
  const batches: ChangeBatch[] = [];
  const batcher = createChangeBatcher({
    onFlush: (batch) => void batches.push(batch),
    schedule: timer.schedule,
    ...(windowMs === undefined ? {} : { windowMs }),
  });
  return { batches, batcher };
};

describe("createChangeBatcher", () => {
  it("collapses a burst for one id into a single refresh", () => {
    const timer = clock();
    const { batches, batcher } = batcherWith(timer);

    for (let i = 0; i < 10; i += 1) batcher.push(doc("doc-1"));
    expect(batches).toEqual([]);

    timer.fire();
    expect(batches).toEqual([
      { changedIds: ["doc-1"], deletedIds: [], proposals: false },
    ]);
  });

  it("keeps distinct ids distinct, in first-mention order", () => {
    const timer = clock();
    const { batches, batcher } = batcherWith(timer);

    batcher.push(doc("doc-2"));
    batcher.push(doc("doc-1"));
    batcher.push(doc("doc-2"));
    timer.fire();

    expect(batches[0].changedIds).toEqual(["doc-2", "doc-1"]);
  });

  it("opens one window per burst, not one timer per event", () => {
    const timer = clock();
    const { batcher } = batcherWith(timer);

    batcher.push(doc("doc-1"));
    expect(timer.delay).toBe(COALESCE_WINDOW_MS);
    batcher.push(doc("doc-2"));
    // A resetting debounce would have re-armed here; a fixed window bounds the
    // delay at `windowMs` however long the burst runs.
    expect(timer.delay).toBe(COALESCE_WINDOW_MS);

    timer.fire();
    expect(batcher.pending).toBe(false);
    expect(timer.delay).toBe(null);
  });

  it("starts a fresh window for events arriving after a flush", () => {
    const timer = clock();
    const { batches, batcher } = batcherWith(timer);

    batcher.push(doc("doc-1"));
    timer.fire();
    batcher.push(doc("doc-1"));
    expect(timer.delay).toBe(COALESCE_WINDOW_MS);
    timer.fire();

    expect(batches).toHaveLength(2);
  });

  it("lets a delete replace a re-fetch queued in the same window", () => {
    const timer = clock();
    const { batches, batcher } = batcherWith(timer);

    batcher.push(doc("doc-1", "document.updated"));
    batcher.push(doc("doc-1", "document.deleted"));
    timer.fire();

    // Fetching a row that is gone would 404, and the id must still reach the
    // reducer as a removal — one entry, on the other side.
    expect(batches).toEqual([
      { changedIds: [], deletedIds: ["doc-1"], proposals: false },
    ]);
  });

  it("lets a create after a delete win, because last wins", () => {
    const timer = clock();
    const { batches, batcher } = batcherWith(timer);

    batcher.push(doc("doc-1", "document.deleted"));
    batcher.push(doc("doc-1", "document.created"));
    timer.fire();

    expect(batches).toEqual([
      { changedIds: ["doc-1"], deletedIds: [], proposals: false },
    ]);
  });

  it("collapses any number of proposal events into one flag", () => {
    const timer = clock();
    const { batches, batcher } = batcherWith(timer);

    batcher.push(proposal("doc-1"));
    batcher.push(proposal("doc-2"));
    batcher.push({
      kind: "proposal.resolved",
      id: "doc-1",
      authorId: "alice",
      origin: "app",
      revisionId: "doc-1-rev",
      resolution: "approved",
    });
    timer.fire();

    // No document ids: an approval's document change arrives as its own
    // `document.updated`, and a bare upsert moves nothing in the document
    // table (§3.2).
    expect(batches).toEqual([
      { changedIds: [], deletedIds: [], proposals: true },
    ]);
  });

  it("carries documents and proposals out of the same window together", () => {
    const timer = clock();
    const { batches, batcher } = batcherWith(timer);

    batcher.push(doc("doc-1"));
    batcher.push(proposal("doc-1"));
    batcher.push(doc("doc-2", "document.deleted"));
    timer.fire();

    expect(batches).toEqual([
      { changedIds: ["doc-1"], deletedIds: ["doc-2"], proposals: true },
    ]);
  });

  it("never flushes an empty batch", () => {
    const timer = clock();
    const { batches, batcher } = batcherWith(timer);

    batcher.flush();
    timer.fire();

    expect(batches).toEqual([]);
  });

  it("drops what is pending on cancel — teardown must not dispatch", () => {
    const timer = clock();
    const { batches, batcher } = batcherWith(timer);

    batcher.push(doc("doc-1"));
    batcher.cancel();
    expect(batcher.pending).toBe(false);
    expect(timer.delay).toBe(null);

    timer.fire();
    expect(batches).toEqual([]);
  });

  it("honours a window it was given", () => {
    const timer = clock();
    const { batcher } = batcherWith(timer, 25);

    batcher.push(doc("doc-1"));
    expect(timer.delay).toBe(25);
  });

  it("puts an event pushed from inside a flush in the next window", () => {
    const timer = clock();
    const batches: ChangeBatch[] = [];
    const batcher = createChangeBatcher({
      schedule: timer.schedule,
      onFlush: (batch) => {
        batches.push(batch);
        if (batches.length === 1) batcher.push(doc("doc-2"));
      },
    });

    batcher.push(doc("doc-1"));
    timer.fire();
    expect(batches).toEqual([
      { changedIds: ["doc-1"], deletedIds: [], proposals: false },
    ]);

    // Re-armed rather than swallowed: the second id is still waiting.
    expect(timer.delay).toBe(COALESCE_WINDOW_MS);
    timer.fire();
    expect(batches[1]).toEqual({
      changedIds: ["doc-2"],
      deletedIds: [],
      proposals: false,
    });
  });
});
