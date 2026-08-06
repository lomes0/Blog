import {
  foldProposal,
  historyOf,
  isProposal,
  type PendingProposal,
  planApproval,
  type ProposalBatch,
  selectHead,
} from "@/lib/proposals";

const at = (iso: string) => new Date(iso);

const row = (
  id: string,
  createdAt: string,
  proposedAt: string | null = null,
) => ({
  id,
  createdAt: at(createdAt),
  proposedAt: proposedAt ? at(proposedAt) : null,
});

const batch = (over: Partial<ProposalBatch> = {}): ProposalBatch => ({
  data: { root: "one" },
  ops: ["op-1"],
  origin: "claude-code",
  base: "head-1",
  at: at("2026-08-06T10:00:00Z"),
  ...over,
});

const pending = (over: Partial<PendingProposal> = {}): PendingProposal => ({
  id: "prop-1",
  version: 0,
  baseRevisionId: "head-1",
  ops: ["op-1"],
  origin: "claude-code",
  summary: null,
  proposedAt: at("2026-08-06T10:00:00Z"),
  ...over,
});

describe("isProposal / historyOf", () => {
  it("calls a row with proposedAt set a proposal and nothing else", () => {
    expect(isProposal(row("a", "2026-08-06T10:00:00Z"))).toBe(false);
    expect(
      isProposal(row("b", "2026-08-06T10:00:00Z", "2026-08-06T10:00:00Z")),
    ).toBe(true);
  });

  it("keeps only history, in the order given", () => {
    const rows = [
      row("c", "2026-08-06T12:00:00Z", "2026-08-06T12:00:00Z"),
      row("b", "2026-08-06T11:00:00Z"),
      row("a", "2026-08-06T10:00:00Z"),
    ];
    expect(historyOf(rows).map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("selectHead", () => {
  const rows = [
    row("proposal", "2026-08-06T13:00:00Z", "2026-08-06T13:00:00Z"),
    row("newest", "2026-08-06T12:00:00Z"),
    row("older", "2026-08-06T11:00:00Z"),
  ];

  it("returns the row head names", () => {
    expect(selectHead(rows, "older").revision?.id).toBe("older");
  });

  it("repairs to the newest row that is not a proposal", () => {
    // The bug this exists to stop: `revisions[0]` is the proposal, and
    // promoting it would make an unreviewed agent write the document.
    const selection = selectHead(rows, "deleted-head");
    expect(selection.revision).toBeNull();
    expect(selection.repair?.id).toBe("newest");
  });

  it("repairs the same way when head is null", () => {
    expect(selectHead(rows, null).repair?.id).toBe("newest");
  });

  it("refuses to serve a proposal even when head names one", () => {
    const selection = selectHead(rows, "proposal");
    expect(selection.revision).toBeNull();
    expect(selection.repair?.id).toBe("newest");
  });

  it("finds the newest by date rather than by position", () => {
    const shuffled = [
      row("older", "2026-08-06T11:00:00Z"),
      row("newest", "2026-08-06T12:00:00Z"),
    ];
    expect(selectHead(shuffled, null).repair?.id).toBe("newest");
  });

  it("has nothing to repair to when every row is a proposal", () => {
    const only = [row("p", "2026-08-06T13:00:00Z", "2026-08-06T13:00:00Z")];
    expect(selectHead(only, null).repair).toBeNull();
  });
});

describe("foldProposal — creating", () => {
  it("records the head the first batch read as the base", () => {
    const plan = foldProposal(null, batch({ base: "head-1" }));
    expect(plan.kind).toBe("create");
    expect(plan.row.baseRevisionId).toBe("head-1");
  });

  it("starts pending, at version 0, with the batch's ops", () => {
    const plan = foldProposal(null, batch());
    expect(plan.row.version).toBe(0);
    expect(plan.row.ops).toEqual(["op-1"]);
    expect(plan.row.proposedAt).toEqual(at("2026-08-06T10:00:00Z"));
    expect(plan.row.createdAt).toEqual(at("2026-08-06T10:00:00Z"));
  });

  it("does not alias the caller's ops array", () => {
    const ops = ["op-1"];
    const plan = foldProposal(null, batch({ ops }));
    ops.push("op-2");
    expect(plan.row.ops).toEqual(["op-1"]);
  });
});

describe("foldProposal — squashing", () => {
  const second = batch({
    data: { root: "two" },
    ops: ["op-2"],
    base: "head-99", // head has moved on; irrelevant to a squash
    at: at("2026-08-06T11:00:00Z"),
  });

  it("carries baseRevisionId through unchanged", () => {
    // The single silent clobber in this design: refreshing the base makes
    // approval's compare-and-set match a state the content never saw, and an
    // intervening save is overwritten with no 409 (§3.2, §9).
    const plan = foldProposal(pending({ baseRevisionId: "head-1" }), second);
    expect(plan.kind).toBe("squash");
    expect(plan.row.baseRevisionId).toBe("head-1");
    expect(plan.row.baseRevisionId).not.toBe(second.base);
  });

  it("does not even offer baseRevisionId to the write", () => {
    const plan = foldProposal(pending(), second);
    if (plan.kind !== "squash") throw new Error("expected a squash");
    expect("baseRevisionId" in plan.patch).toBe(false);
  });

  it("appends ops rather than replacing them", () => {
    const plan = foldProposal(pending({ ops: ["op-1"] }), second);
    expect(plan.row.ops).toEqual(["op-1", "op-2"]);
  });

  it("appends across three batches without losing the first", () => {
    const first = foldProposal(null, batch());
    const two = foldProposal(
      pending({ ops: first.row.ops, version: first.row.version }),
      second,
    );
    const three = foldProposal(
      pending({ ops: two.row.ops, version: two.row.version }),
      batch({ ops: ["op-3"], at: at("2026-08-06T12:00:00Z") }),
    );
    expect(three.row.ops).toEqual(["op-1", "op-2", "op-3"]);
    expect(three.row.baseRevisionId).toBe("head-1");
  });

  it("advances version and names the one it expects to find", () => {
    const plan = foldProposal(pending({ version: 4 }), second);
    if (plan.kind !== "squash") throw new Error("expected a squash");
    expect(plan.expectedVersion).toBe(4);
    expect(plan.patch.version).toBe(5);
  });

  it("takes the batch's state and refreshes createdAt", () => {
    const plan = foldProposal(pending(), second);
    expect(plan.row.data).toEqual({ root: "two" });
    expect(plan.row.createdAt).toEqual(at("2026-08-06T11:00:00Z"));
  });

  it("keeps proposedAt at the first batch's time", () => {
    const plan = foldProposal(
      pending({ proposedAt: at("2026-08-06T10:00:00Z") }),
      second,
    );
    expect(plan.row.proposedAt).toEqual(at("2026-08-06T10:00:00Z"));
  });

  it("keeps the existing summary when a batch supplies none", () => {
    const plan = foldProposal(pending({ summary: "renamed the intro" }), second);
    expect(plan.row.summary).toBe("renamed the intro");
    expect(
      foldProposal(
        pending({ summary: "renamed the intro" }),
        batch({ summary: "and tightened it" }),
      ).row.summary,
    ).toBe("and tightened it");
  });

  it("survives an ops column that is not an array", () => {
    expect(foldProposal(pending({ ops: null }), second).row.ops)
      .toEqual(["op-2"]);
    // Not something this module writes — kept rather than dropped.
    expect(foldProposal(pending({ ops: { odd: true } }), second).row.ops)
      .toEqual([{ odd: true }, "op-2"]);
  });
});

describe("planApproval", () => {
  it("compares against the base, not against whatever head is now", () => {
    const plan = planApproval({ baseRevisionId: "head-1", staleAt: null });
    if (plan.kind !== "approve") throw new Error("expected an approval");
    expect(plan.expectedHead).toBe("head-1");
  });

  it("clears the pending flag and nothing else", () => {
    const plan = planApproval({ baseRevisionId: "head-1", staleAt: null });
    if (plan.kind !== "approve") throw new Error("expected an approval");
    expect(plan.patch).toEqual({ proposedAt: null, staleAt: null });
  });

  it("approves a proposal built on no head at all", () => {
    const plan = planApproval({ baseRevisionId: null, staleAt: null });
    if (plan.kind !== "approve") throw new Error("expected an approval");
    expect(plan.expectedHead).toBeNull();
  });

  it("refuses a proposal whose base stopped being head", () => {
    expect(
      planApproval({
        baseRevisionId: "head-1",
        staleAt: at("2026-08-06T12:00:00Z"),
      }).kind,
    ).toBe("stale");
  });
});
