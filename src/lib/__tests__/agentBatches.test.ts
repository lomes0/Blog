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
 * the two tables, composing exactly the functions the write path composes —
 * `selectHead`, `selectAgentRead`, `foldProposal` — rather than asserting on
 * each in isolation. The database half of the same test is a throwaway script
 * run against the real Postgres; what it adds over this is the partial unique
 * index and the `version` compare-and-set actually firing.
 *
 * That write path is now `src/lib/agentWrites.ts` — `readAgentState` and
 * `proposeOps`, shared by `mcp/content-server.ts` and
 * `POST /api/documents/[id]/proposals` (docs/plans/ai-surface-consolidation.md
 * §4.4.1). The simulation is deliberately **not** rewired onto it: those
 * functions reach Postgres through the `@/lib/prisma` singleton, and standing a
 * fake in for it would mean hand-writing the semantics of `findFirst`,
 * `updateMany`-with-a-version-guard and `$transaction` — a *less* faithful model
 * of the two tables than this one, and one that would quietly mock away the fold
 * and the compare-and-set, which are the subject. What the extraction moved is
 * where the composition lives, not what it composes.
 */
import {
  foldProposal,
  isProposal,
  type PendingProposal,
  planStaleMarking,
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
  staleAt: Date | null;
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
  private nextProp = 0;

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
      staleAt: null,
      createdAt: new Date("2026-08-06T09:00:00Z"),
      version: 0,
    });
    this.head = id;
  }

  newProposalId(): string {
    return `prop-${++this.nextProp}`;
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

  /**
   * What a human editor save does: a fresh history row, head moves — and every
   * pending proposal built on the head it moved off is stamped stale, in the
   * same breath (§3.6). `updateDocument` does exactly these two things in one
   * transaction; doing them separately here would model a system that cannot
   * exist.
   */
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
      staleAt: null,
      createdAt: at,
      version: 0,
    });
    this.head = id;

    const marking = planStaleMarking(this.all().filter(isProposal), id, at);
    for (const stale of marking.ids) this.rows.get(stale)!.staleAt = marking.at;
    return id;
  }
}

// ─── The two halves of one `apply_ops` call ──────────────────────────────────

/** `readAgentState`: the state the agent addresses, and the base for a write. */
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
  staleAt: row.staleAt,
});

/** `upsertProposal`: execute the plan, honouring the `version` CAS. */
const propose = (
  store: Store,
  next: Blocks,
  op: SetText,
  base: string | null,
  at: Date,
) => {
  const existing = store.pending();
  const plan = foldProposal(existing ? toPending(existing) : null, {
    data: next,
    ops: [op],
    origin: "claude-code",
    base,
    at,
  });

  if (plan.kind === "create" || plan.kind === "replace") {
    // One transaction in the repository, delete first: one pending row per
    // document is enforced by a partial unique index, so the stale row has to
    // go before the fresh one can exist.
    if (plan.kind === "replace") store.rows.delete(plan.replaces);
    const id = store.newProposalId();
    store.rows.set(id, {
      id,
      data: plan.row.data as Blocks,
      ops: plan.row.ops,
      origin: plan.row.origin,
      summary: plan.row.summary,
      baseRevisionId: plan.row.baseRevisionId,
      proposedAt: plan.row.proposedAt,
      staleAt: null,
      createdAt: plan.row.createdAt,
      version: plan.row.version,
    });
    return id;
  }

  const row = store.rows.get(plan.id)!;
  // The CAS: `updateMany where { id, version }`. A miss means someone folded
  // first, and the caller re-reads — here it is an outright failure, because in
  // a single-threaded test nothing else can have folded.
  if (row.version !== plan.expectedVersion) {
    throw new Error(
      `version CAS missed: ${row.version} !== ${plan.expectedVersion}`,
    );
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
      applyOps(
        store,
        { op: "set_text", index: 0, text: "ONE" },
        at("2026-08-06T10:00:00Z"),
      ),
    ];
    heads.push(store.head);
    batches.push(
      applyOps(
        store,
        { op: "set_text", index: 1, text: "TWO" },
        at("2026-08-06T10:01:00Z"),
      ),
    );
    heads.push(store.head);
    batches.push(
      applyOps(
        store,
        { op: "set_text", index: 2, text: "THREE" },
        at("2026-08-06T10:02:00Z"),
      ),
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
   * Phase 5's whole subject (§3.6), and the worse of the two silent losses in
   * §9 at the same time: if the squash refreshed the base to whatever head is
   * now, approval's compare-and-set would match and the save made in between
   * would be overwritten with no 409 and no staleness.
   *
   * The save stamps the proposal stale, so the second batch does *not* fold onto
   * it — it reads the live document and starts a new proposal against that.
   */
  const run = () => {
    const store = new Store({ text: ["one", "two", "three"] });
    const first = applyOps(
      store,
      { op: "set_text", index: 0, text: "ONE" },
      at("2026-08-06T10:00:00Z"),
    );
    const stale = store.pending()!;
    const saved = store.save(
      { text: ["one", "two", "EDITED BY HAND"] },
      at("2026-08-06T10:00:30Z"),
    );
    const second = applyOps(
      store,
      { op: "set_text", index: 1, text: "TWO" },
      at("2026-08-06T10:01:00Z"),
    );
    return { store, first, stale, saved, second };
  };

  it("stamps the proposal stale as the save moves head", () => {
    const { store, first, stale, saved } = run();
    expect(store.head).toBe(saved);
    // Captured before the second batch replaced it: the row the save invalidated.
    expect(stale.id).toBe(first.id);
    expect(stale.staleAt).toEqual(at("2026-08-06T10:00:30Z"));
  });

  it("never refreshes the stale row's base on its way out", () => {
    // The one invariant with no database constraint behind it: had the fold
    // refreshed the base instead of refusing, approval's CAS would have matched
    // and the hand edit would be gone.
    const { stale, saved } = run();
    expect(stale.baseRevisionId).toBe("rev-head");
    expect(stale.baseRevisionId).not.toBe(saved);
  });

  it("reads the live document rather than the stale proposal", () => {
    // Before phase 5 the second batch went on reading the proposal, and so
    // never saw the hand edit. Continuing to build there only grows something
    // approval must refuse (§3.6).
    const { second } = run();
    expect(second.source).toBe("committed");
    expect(second.seen.text).toEqual(["one", "two", "EDITED BY HAND"]);
  });

  it("replaces the stale proposal instead of folding onto it", () => {
    const { store, first, second } = run();
    expect(second.id).not.toBe(first.id);
    // Still exactly one pending row — the partial unique index would refuse two.
    expect(store.all().filter(isProposal)).toHaveLength(1);
    expect(store.rows.has(first.id)).toBe(false);
  });

  it("leaves a proposal that can actually be approved", () => {
    const { store, saved } = run();
    const pending = store.pending()!;
    expect(pending.staleAt).toBeNull();
    // `approveProposal` does `updateMany where { id, head: baseRevisionId }`,
    // and this one matches: the new proposal is based on the save.
    expect(pending.baseRevisionId).toBe(saved);
    expect(store.head).toBe(pending.baseRevisionId);
    // Built on the author's text, not on the discarded batch's.
    expect(pending.data.text).toEqual(["one", "TWO", "EDITED BY HAND"]);
    expect(pending.ops).toEqual([{ op: "set_text", index: 1, text: "TWO" }]);
  });
});

describe("selectAgentRead", () => {
  const proposal = {
    id: "prop-1",
    baseRevisionId: "rev-head",
    staleAt: null as Date | null,
  };
  const committed = { id: "rev-head" };

  it("prefers the pending proposal over the committed document", () => {
    const read = selectAgentRead({
      head: "rev-head",
      pending: proposal,
      committed,
    });
    expect(read.source).toBe("proposal");
    expect(read.revision).toBe(proposal);
  });

  it("bases a write on head even when it read the proposal", () => {
    // The whole point of keeping these two apart: recording the proposal's own
    // id would make approval's CAS test a value head never held.
    const read = selectAgentRead({
      head: "rev-head",
      pending: proposal,
      committed,
    });
    expect(read.base).toBe("rev-head");
    expect(read.base).not.toBe(proposal.id);
  });

  it("reads the committed document when nothing is pending", () => {
    const read = selectAgentRead({
      head: "rev-head",
      pending: null,
      committed,
    });
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
    const read = selectAgentRead({
      head: null,
      pending: null,
      committed: null,
    });
    expect(read).toEqual({
      source: "empty",
      revision: null,
      base: null,
      staleProposal: false,
    });
  });

  it("passes over a stale proposal and says it did", () => {
    // The agent has to be told, or it will report work as pending that can no
    // longer be approved (§3.6).
    const read = selectAgentRead({
      head: "rev-head",
      pending: { ...proposal, staleAt: new Date("2026-08-06T12:00:00Z") },
      committed,
    });
    expect(read.source).toBe("committed");
    expect(read.revision).toBe(committed);
    expect(read.staleProposal).toBe(true);
  });

  it("passes over one whose base is not head, stamp or no stamp", () => {
    // The proposal created while a save was in flight: no marker ever ran over
    // a row that did not exist yet, and the pointers are the only evidence.
    const read = selectAgentRead({
      head: "rev-save-0",
      pending: proposal,
      committed,
    });
    expect(read.source).toBe("committed");
    expect(read.staleProposal).toBe(true);
    // And the write it bases is on the head it actually read.
    expect(read.base).toBe("rev-save-0");
  });
});
