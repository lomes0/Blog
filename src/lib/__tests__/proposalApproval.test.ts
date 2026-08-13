/**
 * Partial approval, composed the way `approveProposal` composes it
 * (docs/plans/archive/haklex-adoption.md §7, docs/plans/archive/agent-gating.md §3.2–§3.4).
 *
 * `proposals.test.ts` pins the plan and `proposalDiff.test.ts` pins the diff.
 * Neither can see the thing this commit actually adds, which is what happens
 * when a *plan* meets a *merge* meets two compare-and-sets over two tables — so
 * this is the acceptance test, in the shape `agentBatches.test.ts` already
 * established: an in-memory stand-in for Document + Revision, driven by exactly
 * the functions the repository drives, rather than a mock of Prisma.
 *
 * What it is here to prove, and every item is a way to lose an author's work
 * silently:
 *
 * - **Refusing nothing is the old path.** Not "equivalent to" — the row's
 *   `data` must not be rewritten at all, because a re-materialized copy would
 *   be an equal document with a different `stateHash`, and every address an
 *   agent holds is minted against that.
 * - **`baseRevisionId` survives a partial approval**, exactly as it survives a
 *   squash. It is written once, on creation, and nothing about taking half a
 *   proposal is a reason to move it.
 * - **The head compare-and-set is still against the base**, not against
 *   whatever head is now, so an author's save in another tab refuses instead of
 *   being overwritten by a half-accepted proposal.
 * - **The row's own `version` is a second fence.** A batch squashing onto the
 *   proposal between the read and the write must not ride into head unreviewed.
 * - **Ids are checked, never trusted.** The server recomputes the diff; an id
 *   it does not produce is a refusal, not an accept-everything.
 */
import {
  type ApprovalDecisions,
  noteApplied,
  planApproval,
} from "@/lib/proposals";
import {
  applyDecisions,
  diffProposal,
  UnknownHunkError,
} from "@/lib/proposalDiff";
import { applyOps, type Op } from "@/lib/content-bridge/ops";
import { stateHash } from "@/lib/content-bridge/stateHash";
import type { SerializedNode, StoredState } from "@/lib/content-bridge/types";
import { makeState, snapshot } from "@/lib/content-bridge/__tests__/fixture";

// ─── An in-memory stand-in for Document + Revision ───────────────────────────

interface Row {
  id: string;
  data: StoredState;
  ops: unknown[];
  summary: string | null;
  baseRevisionId: string | null;
  proposedAt: Date | null;
  staleAt: Date | null;
  version: number;
}

/** Every way approval can answer, as the repository's `ApproveResult` spells it. */
type Result =
  | { ok: true; head: string; partial?: { applied: number; total: number } }
  | { ok: false; reason: "not-found" | "stale" | "conflict" | "version-moved" }
  | { ok: false; reason: "unknown-hunks"; ids: string[] };

class Store {
  head: string | null;
  readonly rows = new Map<string, Row>();

  constructor(seed: StoredState) {
    this.rows.set("rev-head", {
      id: "rev-head",
      data: seed,
      ops: [],
      summary: null,
      baseRevisionId: null,
      proposedAt: null,
      staleAt: null,
      version: 0,
    });
    this.head = "rev-head";
  }

  get pending(): Row {
    const row = [...this.rows.values()].find((candidate) => candidate.proposedAt);
    if (!row) throw new Error("no pending proposal");
    return row;
  }

  /** What the MCP server's write path leaves behind: one pending row (§3.2). */
  propose(state: StoredState, ops: Op[], summary: string | null = null): Row {
    const row: Row = {
      id: "prop-1",
      data: state,
      ops,
      summary,
      // Written once, here, and never again — the invariant under test.
      baseRevisionId: this.head,
      proposedAt: new Date("2026-08-09T10:00:00Z"),
      staleAt: null,
      version: 0,
    };
    this.rows.set(row.id, row);
    return row;
  }

  /** A later agent batch folding onto the same row: `version` advances, base does not. */
  squash(state: StoredState, ops: Op[]): void {
    const row = this.pending;
    row.data = state;
    row.ops = [...row.ops, ...ops];
    row.version += 1;
  }

  /** An author save underneath the proposal: head moves, the row is stamped (§3.6). */
  save(state: StoredState): void {
    this.rows.set("rev-save", {
      id: "rev-save",
      data: state,
      ops: [],
      summary: null,
      baseRevisionId: null,
      proposedAt: null,
      staleAt: null,
      version: 0,
    });
    this.head = "rev-save";
    for (const row of this.rows.values()) {
      if (row.proposedAt && !row.staleAt) row.staleAt = new Date();
    }
  }
}

/**
 * `approveProposal`'s transaction, over the stand-in.
 *
 * Deliberately the same order of operations as the repository — plan, then
 * merge, then the head compare-and-set, then the guarded row write — because
 * the order is half of what is being asserted: everything that can refuse has
 * to refuse *before* `head` moves, and the one thing that cannot (the row
 * moving under the merge) has to unwind the head move again.
 */
const approve = (
  store: Store,
  revisionId: string,
  decisions: ApprovalDecisions = {},
  /** Simulates another batch committing between the read and the row write. */
  raceBefore?: () => void,
): Result => {
  const proposal = store.rows.get(revisionId);
  if (!proposal?.proposedAt) return { ok: false, reason: "not-found" };

  const plan = planApproval(proposal, decisions);
  if (plan.kind === "stale") return { ok: false, reason: "stale" };
  if (plan.kind === "version-moved") return { ok: false, reason: "version-moved" };

  let content: { data: StoredState; summary: string | null } | null = null;
  let partial: { applied: number; total: number } | undefined;

  if (plan.rejected.length > 0) {
    const base = proposal.baseRevisionId
      ? store.rows.get(proposal.baseRevisionId)?.data
      : undefined;
    if (!base) return { ok: false, reason: "conflict" };

    const total = diffProposal(base, proposal.data).length;
    try {
      content = {
        data: applyDecisions(base, proposal.data, plan.rejected),
        summary: noteApplied(
          proposal.summary,
          total - new Set(plan.rejected).size,
          total,
        ),
      };
    } catch (error) {
      if (!(error instanceof UnknownHunkError)) throw error;
      return { ok: false, reason: "unknown-hunks", ids: [...error.ids] };
    }
    partial = { applied: total - new Set(plan.rejected).size, total };
  }

  // The head compare-and-set, against the base and never against head-as-it-is.
  if (store.head !== plan.expectedHead) return { ok: false, reason: "conflict" };
  const restoreHead = store.head;
  store.head = revisionId;

  raceBefore?.();

  // The guarded row write. A miss means a batch squashed under us, and `head`
  // has to come back — in the repository that is a thrown error rolling the
  // transaction back.
  if (proposal.version !== plan.expectedVersion) {
    store.head = restoreHead;
    return { ok: false, reason: "version-moved" };
  }
  proposal.proposedAt = null;
  proposal.staleAt = null;
  if (content) {
    proposal.data = content.data;
    proposal.summary = content.summary;
  }

  return { ok: true, head: revisionId, ...(partial ? { partial } : {}) };
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const propose = (base: StoredState, ops: Op[]): StoredState =>
  applyOps(base, stateHash(base), ops).state;

/** Three independent changes, so a reviewer has something to pick between. */
const THREE: Op[] = [
  { op: "set_text", id: "b2", text: "Rewritten." },
  { op: "insert_blocks", after: "b2", blocks: [
    { type: "quote", text: "An epigraph." },
  ] },
  { op: "delete_block", id: "b7" },
];

const seeded = (ops: Op[] = THREE, summary: string | null = null) => {
  const base = makeState();
  const store = new Store(base);
  store.propose(propose(base, ops), ops, summary);
  return { base, store };
};

const hunkIds = (base: StoredState, proposal: StoredState) =>
  diffProposal(base, proposal).map((hunk) => hunk.id);

const texts = (state: StoredState): string[] =>
  (state.root.children as SerializedNode[]).map((node) =>
    ((node.children as SerializedNode[] | undefined)?.[0]?.text as string) ?? "",
  );

// ─── The ends: nothing refused, everything refused ───────────────────────────

describe("approval with no decisions", () => {
  it("writes the proposal's own state, untouched", () => {
    const { store } = seeded();
    const before = store.pending.data;

    expect(approve(store, "prop-1").ok).toBe(true);
    // Identity, not equality. A re-materialized copy would be the same document
    // with a different `stateHash`, and every address an agent holds is minted
    // against that hash.
    expect(store.rows.get("prop-1")!.data).toBe(before);
  });

  it("reports no partial half at all", () => {
    const { store } = seeded();
    const result = approve(store, "prop-1");
    expect(result).toEqual({ ok: true, head: "prop-1" });
  });

  it("takes the same path for an explicitly empty refusal", () => {
    const { store } = seeded();
    const before = store.pending.data;
    expect(approve(store, "prop-1", { rejectedHunks: [] })).toEqual({
      ok: true,
      head: "prop-1",
    });
    expect(store.rows.get("prop-1")!.data).toBe(before);
  });

  it("leaves the agent's summary alone", () => {
    const { store } = seeded(THREE, "Rewrote the intro.");
    approve(store, "prop-1");
    expect(store.rows.get("prop-1")!.summary).toBe("Rewrote the intro.");
  });
});

describe("approval with everything refused", () => {
  it("lands the document back on the base, byte for byte", () => {
    const { base, store } = seeded();
    const all = hunkIds(base, store.pending.data);
    expect(all).toHaveLength(3);

    const result = approve(store, "prop-1", { rejectedHunks: all });
    expect(result).toEqual({
      ok: true,
      head: "prop-1",
      partial: { applied: 0, total: 3 },
    });
    expect(snapshot(store.rows.get("prop-1")!.data)).toBe(snapshot(base));
  });

  it("still moves head — the author decided, and that decision is history", () => {
    const { base, store } = seeded();
    approve(store, "prop-1", { rejectedHunks: hunkIds(base, store.pending.data) });
    expect(store.head).toBe("prop-1");
    expect(store.rows.get("prop-1")!.proposedAt).toBeNull();
  });
});

// ─── The middle: some of it ──────────────────────────────────────────────────

describe("partial approval", () => {
  it("keeps the accepted hunks and drops the refused ones", () => {
    const { base, store } = seeded();
    const hunks = diffProposal(base, store.pending.data);
    const insert = hunks.find((hunk) => hunk.kind === "insert")!;
    const remove = hunks.find((hunk) => hunk.kind === "delete")!;

    approve(store, "prop-1", { rejectedHunks: [insert.id, remove.id] });
    const applied = store.rows.get("prop-1")!.data;

    // The replace was taken…
    expect(texts(applied)).toContain("Rewritten.");
    // …the insert was not…
    expect(texts(applied)).not.toContain("An epigraph.");
    // …and the refused delete put its block back where it stood.
    expect(texts(applied)).toEqual(texts(base).map((text, index) =>
      index === 1 ? "Rewritten." : text
    ));
  });

  it("counts what it applied", () => {
    const { base, store } = seeded();
    const [first] = hunkIds(base, store.pending.data);
    expect(approve(store, "prop-1", { rejectedHunks: [first] })).toEqual({
      ok: true,
      head: "prop-1",
      partial: { applied: 2, total: 3 },
    });
  });

  it("counts a repeated id once", () => {
    const { base, store } = seeded();
    const [first] = hunkIds(base, store.pending.data);
    const result = approve(store, "prop-1", { rejectedHunks: [first, first] });
    expect(result).toEqual({
      ok: true,
      head: "prop-1",
      partial: { applied: 2, total: 3 },
    });
  });

  it("says in the summary how much of it was taken", () => {
    const { base, store } = seeded(THREE, "Rewrote the intro.");
    const [first] = hunkIds(base, store.pending.data);
    approve(store, "prop-1", { rejectedHunks: [first] });
    expect(store.rows.get("prop-1")!.summary).toBe(
      "Rewrote the intro. — Applied 2 of 3 proposed changes.",
    );
  });

  it("leaves `ops` exactly as the agent wrote them", () => {
    // `ops` records what was *proposed*; the approved `data` records what was
    // accepted. Rewriting the ops to match the decision would destroy the only
    // record of the difference (§3.3).
    const { base, store } = seeded();
    const [first] = hunkIds(base, store.pending.data);
    approve(store, "prop-1", { rejectedHunks: [first] });
    expect(store.rows.get("prop-1")!.ops).toEqual(THREE);
  });

  it("never touches `baseRevisionId`", () => {
    // Write-once (§3.2). A partial approval reads it — as the head
    // compare-and-set — and has no business moving it.
    const { base, store } = seeded();
    const [first] = hunkIds(base, store.pending.data);
    approve(store, "prop-1", { rejectedHunks: [first] });
    expect(store.rows.get("prop-1")!.baseRevisionId).toBe("rev-head");
  });

  it("leaves `version` where it was", () => {
    // The squash token's job ends when the row stops being pending; approval
    // spends it as a guard rather than advancing it.
    const { base, store } = seeded();
    store.squash(store.pending.data, []);
    const [first] = hunkIds(base, store.pending.data);
    approve(store, "prop-1", { rejectedHunks: [first], version: 1 });
    expect(store.rows.get("prop-1")!.version).toBe(1);
  });
});

// ─── Refusals ────────────────────────────────────────────────────────────────

describe("what a partial approval refuses", () => {
  it("refuses a stale proposal, hunks or no hunks", () => {
    const { base, store } = seeded();
    const [first] = hunkIds(base, store.pending.data);
    store.save(makeState());

    expect(approve(store, "prop-1", { rejectedHunks: [first] })).toEqual({
      ok: false,
      reason: "stale",
    });
    expect(store.head).toBe("rev-save");
    expect(store.rows.get("prop-1")!.proposedAt).not.toBeNull();
  });

  it("refuses a hunk id its own diff does not contain", () => {
    const { store } = seeded();
    const result = approve(store, "prop-1", {
      rejectedHunks: ["replace:blk_nope|b2", "delete:-|b9"],
    });
    expect(result).toEqual({
      ok: false,
      reason: "unknown-hunks",
      ids: ["delete:-|b9", "replace:blk_nope|b2"],
    });
    // Nothing moved: an unrecognised selection is not a licence to take the lot.
    expect(store.head).toBe("rev-head");
    expect(store.rows.get("prop-1")!.proposedAt).not.toBeNull();
  });

  it("refuses ids computed against a version the row has moved past", () => {
    const { base, store } = seeded();
    const reviewed = hunkIds(base, store.pending.data);
    // Claude adds another batch while the review page is open. Neither `head`
    // nor the base moved, so this is the only fence that can see it.
    store.squash(propose(base, [{ op: "set_text", id: "b1", text: "More." }]), []);

    expect(
      approve(store, "prop-1", { rejectedHunks: reviewed, version: 0 }),
    ).toEqual({ ok: false, reason: "version-moved" });
    expect(store.head).toBe("rev-head");
  });

  it("puts head back when the row moves during the merge", () => {
    // The one refusal that has to unwind a write it already made. In the
    // repository this is a thrown error rolling the transaction back.
    const { base, store } = seeded();
    const [first] = hunkIds(base, store.pending.data);

    const result = approve(
      store,
      "prop-1",
      { rejectedHunks: [first], version: 0 },
      () => store.squash(store.pending.data, []),
    );
    expect(result).toEqual({ ok: false, reason: "version-moved" });
    expect(store.head).toBe("rev-head");
    expect(store.rows.get("prop-1")!.proposedAt).not.toBeNull();
  });

  it("refuses when head moved off the base without a stale stamp", () => {
    // The window §3.6 cannot stamp: the head compare-and-set is what catches it,
    // and it catches it identically whether or not hunks were named.
    const { base, store } = seeded();
    const [first] = hunkIds(base, store.pending.data);
    store.head = "rev-elsewhere";

    expect(approve(store, "prop-1", { rejectedHunks: [first] })).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(store.rows.get("prop-1")!.proposedAt).not.toBeNull();
  });

  it("refuses rather than invent a base that is no longer stored", () => {
    const { base, store } = seeded();
    const [first] = hunkIds(base, store.pending.data);
    store.rows.delete("rev-head");

    expect(approve(store, "prop-1", { rejectedHunks: [first] })).toEqual({
      ok: false,
      reason: "conflict",
    });
  });

  it("answers not-found for a revision that is not pending", () => {
    const { store } = seeded();
    expect(approve(store, "rev-head")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});
