/**
 * The phase-2 acceptance test of docs/plans/agent-gating.md, in the pure half.
 *
 * Three consecutive `apply_ops` calls against one document must leave **exactly
 * one** pending proposal containing all three edits, each batch having seen the
 * previous one's work, with `head` untouched throughout and `baseRevisionId`
 * still naming the head the *first* batch read.
 *
 * §9 calls a botched squash the single real risk in the plan, and every way of
 * botching it is silent: the fold goes onto `head` instead of onto the pending
 * state and the earlier batch vanishes; two folds race and the later overwrites
 * the earlier; or the base is refreshed and approval overwrites *your* save with
 * no 409. So the loop is simulated here in full, over an in-memory stand-in for
 * the two tables, composing exactly the functions `mcp/content-server.ts`
 * composes — `selectHead`, `selectAgentRead`, `foldProposal` — rather than
 * asserting on each in isolation. The database half of the same test is a
 * throwaway script run against the real Postgres; what it adds over this is the
 * partial unique index and the `version` compare-and-set actually firing.
 */
import {
  foldProposal,
  isProposal,
  type PendingProposal,
  selectAgentRead,
  selectHead,
} from "@/lib/proposals";

// ─── An in-memory stand-in for Document + Revision ───────────────────────────

/** The document state an agent edits: one string per block, addressed by index. */
interface Blocks {
  text: string[];
}

interface Row {
  id: string;
  data: Blocks;
  ops: unknown;
  origin: string | null;
  summary: string | null;
  baseRevisionId: string | null;
  proposedAt: Date | null;
  createdAt: Date;
  version: number;
}

/** One agent op, as `apply_ops` would carry it. */
interface SetText {
  op: "set_text";
  index: number;
  text: string;
}

class Store {
  head: string | null;
  readonly rows = new Map<string, Row>();
  private nextId = 0;

  constructor(seed: Blocks) {
    const id = "rev-head";
    this.rows.set(id, {
      id,
      data: seed,
      ops: null,
      origin: null,
      summary: null,
      baseRevisionId: null,
      proposedAt: null,
      createdAt: new Date("2026-08-06T09:00:00Z"),
      version: 0,
    });
    this.head = id;
  }

  all(): Row[] {
    // Newest first, as every real query here is ordered.
    return [...this.rows.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  pending(): Row | null {
    return this.all().find(isProposal) ?? null;
  }

  /** What a human editor save does: a fresh history row, and head moves. */
  save(data: Blocks, at: Date): string {
    const id = `rev-save-${this.nextId++}`;
    this.rows.set(id, {
      id,
      data,
      ops: null,
      origin: null,
      summary: null,
      baseRevisionId: null,
      proposedAt: null,
      createdAt: at,
      version: 0,
    });
    this.head = id;
    return id;
  }
}

// ─── The two halves of one `apply_ops` call ──────────────────────────────────

/** `loadPost`: resolve the state the agent addresses, and the base for a write. */
const read = (store: Store) => {
  const rows = store.all();
  const selection = selectHead(rows, store.head);
  return selectAgentRead({
    head: store.head,
    pending: store.pending(),
    committed: selection.revision ?? selection.repair,
  });
};

/** `applyOps`: the edit itself. Deliberately trivial — the fold is the subject. */
const apply = (state: Blocks, op: SetText): Blocks => {
  const text = [...state.text];
  text[op.index] = op.text;
  return { text };
};

const toPending = (row: Row): PendingProposal => ({
  id: row.id,
  version: row.version,
  baseRevisionId: row.baseRevisionId,
  ops: row.ops,
  origin: row.origin,
  summary: row.summary,
  proposedAt: row.proposedAt as Date,
});

/** `upsertProposal`: execute the plan, honouring the `version` CAS. */
const propose = (store: Store, next: Blocks, op: SetText, base: string | null, at: Date) => {
  const existing = store.pending();
  const plan = foldProposal(existing ? toPending(existing) : null, {
    data: next,
    ops: [op],
    origin: "claude-code",
    base,
    at,
  });

  if (plan.kind === "create") {
    store.rows.set("prop-1", {
      id: "prop-1",
      data: plan.row.data as Blocks,
      ops: plan.row.ops,
      origin: plan.row.origin,
      summary: plan.row.summary,
      baseRevisionId: plan.row.baseRevisionId,
      proposedAt: plan.row.proposedAt,
      createdAt: plan.row.createdAt,
      version: plan.row.version,
    });
    return "prop-1";
  }

  const row = store.rows.get(plan.id)!;
  // The CAS: `updateMany where { id, version }`. A miss means someone folded
  // first, and the caller re-reads — here it is an outright failure, because in
  // a single-threaded test nothing else can have folded.
  if (row.version !== plan.expectedVersion) {
    throw new Error(`version CAS missed: ${row.version} !== ${plan.expectedVersion}`);
  }
  Object.assign(row, {
    data: plan.patch.data as Blocks,
    ops: plan.patch.ops,
    origin: plan.patch.origin,
    summary: plan.patch.summary,
    proposedAt: plan.patch.proposedAt,
    createdAt: plan.patch.createdAt,
    version: plan.patch.version,
    // `baseRevisionId` is untouched — `plan.patch` does not even carry it.
  });
  return plan.id;
};

/** One whole `apply_ops` call: read, edit, propose. */
const applyOps = (store: Store, op: SetText, at: Date) => {
  const state = read(store);
  const seen = (state.revision as Row | null)?.data ?? { text: [] };
  const id = propose(store, apply(seen, op), op, state.base, at);
  return { id, seen, source: state.source };
};

const at = (iso: string) => new Date(iso);

// ─── The acceptance test ─────────────────────────────────────────────────────

describe("three consecutive agent batches", () => {
  const run = () => {
    const store = new Store({ text: ["one", "two", "three"] });
    const heads: (string | null)[] = [store.head];
    const batches = [
      applyOps(store, { op: "set_text", index: 0, text: "ONE" }, at("2026-08-06T10:00:00Z")),
    ];
    heads.push(store.head);
    batches.push(
      applyOps(store, { op: "set_text", index: 1, text: "TWO" }, at("2026-08-06T10:01:00Z")),
    );
    heads.push(store.head);
    batches.push(
      applyOps(store, { op: "set_text", index: 2, text: "THREE" }, at("2026-08-06T10:02:00Z")),
    );
    heads.push(store.head);
    return { store, heads, batches };
  };

  it("leaves exactly one pending proposal", () => {
    const { store } = run();
    const pending = store.all().filter(isProposal);
    expect(pending).toHaveLength(1);
    // And the history it was built on is still there, unchanged.
    expect(store.all().filter((r) => !isProposal(r)).map((r) => r.id))
      .toEqual(["rev-head"]);
  });

  it("holds all three edits, ops and content alike", () => {
    const { store } = run();
    const proposal = store.pending()!;
    expect(proposal.ops).toEqual([
      { op: "set_text", index: 0, text: "ONE" },
      { op: "set_text", index: 1, text: "TWO" },
      { op: "set_text", index: 2, text: "THREE" },
    ]);
    // The materialized state carries every batch, not just the last.
    expect(proposal.data.text).toEqual(["ONE", "TWO", "THREE"]);
  });

  it("shows each batch the previous one's work", () => {
    const { batches } = run();
    // Batch 1 read the committed document; 2 and 3 read the pending proposal.
    expect(batches.map((b) => b.source)).toEqual([
      "committed",
      "proposal",
      "proposal",
    ]);
    expect(batches[0].seen.text).toEqual(["one", "two", "three"]);
    expect(batches[1].seen.text).toEqual(["ONE", "two", "three"]);
    expect(batches[2].seen.text).toEqual(["ONE", "TWO", "three"]);
    // All three folded onto the same row rather than starting new ones.
    expect(new Set(batches.map((b) => b.id)).size).toBe(1);
  });

  it("never moves head", () => {
    const { store, heads } = run();
    expect(heads).toEqual(["rev-head", "rev-head", "rev-head", "rev-head"]);
    expect(store.head).toBe("rev-head");
    // The proposal is in storage and is not the document.
    expect(store.pending()!.id).not.toBe(store.head);
  });

  it("keeps baseRevisionId naming the head the first batch read", () => {
    const { store } = run();
    expect(store.pending()!.baseRevisionId).toBe("rev-head");
  });

  it("advances version once per squash", () => {
    const { store } = run();
    // 0 on creation, then one bump per fold — the only thing serializing two
    // batches once `head` stops moving (§3.2).
    expect(store.pending()!.version).toBe(2);
  });
});

describe("a human saves between two agent batches", () => {
  /**
   * The worse of the two silent losses (§9): if the squash refreshed the base
   * to whatever head is now, approval's compare-and-set would match, and the
   * save made in between would be overwritten with no 409 and no staleness.
   */
  const run = () => {
    const store = new Store({ text: ["one", "two", "three"] });
    applyOps(store, { op: "set_text", index: 0, text: "ONE" }, at("2026-08-06T10:00:00Z"));
    const saved = store.save({ text: ["one", "two", "EDITED BY HAND"] }, at("2026-08-06T10:00:30Z"));
    const second = applyOps(
      store,
      { op: "set_text", index: 1, text: "TWO" },
      at("2026-08-06T10:01:00Z"),
    );
    return { store, saved, second };
  };

  it("still names the original base, not the new head", () => {
    const { store, saved } = run();
    expect(store.head).toBe(saved);
    expect(store.pending()!.baseRevisionId).toBe("rev-head");
    expect(store.pending()!.baseRevisionId).not.toBe(saved);
  });

  it("means approval's CAS misses rather than clobbering the save", () => {
    const { store } = run();
    // `approveProposal` does `updateMany where { id, head: baseRevisionId }`.
    expect(store.head === store.pending()!.baseRevisionId).toBe(false);
  });

  it("keeps reading the proposal, so the agent never silently rebases", () => {
    // The second batch read the proposal, so it did *not* see the hand edit —
    // which is why approval must refuse rather than merge (§3.6).
    const { store, second } = run();
    expect(second.source).toBe("proposal");
    expect(second.seen.text).toEqual(["ONE", "two", "three"]);
    expect(store.pending()!.data.text).toEqual(["ONE", "TWO", "three"]);
  });
});

describe("selectAgentRead", () => {
  const proposal = { id: "prop-1" };
  const committed = { id: "rev-head" };

  it("prefers the pending proposal over the committed document", () => {
    const read = selectAgentRead({ head: "rev-head", pending: proposal, committed });
    expect(read.source).toBe("proposal");
    expect(read.revision).toBe(proposal);
  });

  it("bases a write on head even when it read the proposal", () => {
    // The whole point of keeping these two apart: recording the proposal's own
    // id would make approval's CAS test a value head never held.
    const read = selectAgentRead({ head: "rev-head", pending: proposal, committed });
    expect(read.base).toBe("rev-head");
    expect(read.base).not.toBe(proposal.id);
  });

  it("reads the committed document when nothing is pending", () => {
    const read = selectAgentRead({ head: "rev-head", pending: null, committed });
    expect(read.source).toBe("committed");
    expect(read.revision).toBe(committed);
    expect(read.base).toBe("rev-head");
  });

  it("bases on a null head, so approval only matches a still-headless document", () => {
    // A document whose head was deleted still reads its latest content, but
    // "head is null" is the precondition the proposal was built under.
    const read = selectAgentRead({ head: null, pending: null, committed });
    expect(read.source).toBe("committed");
    expect(read.base).toBeNull();
  });

  it("calls a document with no content at all empty rather than missing", () => {
    const read = selectAgentRead({ head: null, pending: null, committed: null });
    expect(read).toEqual({ source: "empty", revision: null, base: null });
  });
});
