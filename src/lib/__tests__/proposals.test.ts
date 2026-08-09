import {
  foldProposal,
  historyOf,
  isProposal,
  isProposalStale,
  noteApplied,
  type PendingProposal,
  planApproval,
  planStaleMarking,
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
  staleAt: null,
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
    // Head has not moved, which is what a squash *is*: a batch standing on the
    // same base as the row it folds into. A batch that read a different head is
    // the stale case below, and it replaces rather than folds.
    base: "head-1",
    at: at("2026-08-06T11:00:00Z"),
  });

  it("carries baseRevisionId through unchanged", () => {
    // The single silent clobber in this design: refreshing the base makes
    // approval's compare-and-set match a state the content never saw, and an
    // intervening save is overwritten with no 409 (§3.2, §9).
    const plan = foldProposal(pending({ baseRevisionId: "head-1" }), second);
    expect(plan.kind).toBe("squash");
    expect(plan.row.baseRevisionId).toBe("head-1");
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
    const plan = foldProposal(
      pending({ summary: "renamed the intro" }),
      second,
    );
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

describe("isProposalStale", () => {
  it("says no while the base is still head", () => {
    expect(
      isProposalStale({ baseRevisionId: "head-1", staleAt: null }, "head-1"),
    )
      .toBe(false);
  });

  it("says yes once head has moved off the base, unstamped", () => {
    // The proposal written while a save was in flight: no marker could have run
    // over a row that did not exist yet, and the two pointers are the evidence.
    expect(
      isProposalStale({ baseRevisionId: "head-1", staleAt: null }, "head-2"),
    )
      .toBe(true);
  });

  it("says yes on the stamp alone", () => {
    expect(
      isProposalStale(
        { baseRevisionId: "head-1", staleAt: at("2026-08-06T12:00:00Z") },
        "head-1",
      ),
    ).toBe(true);
  });

  it("takes the stamp as a date or as the string it arrives as over the wire", () => {
    // The rail reads a JSON payload; the repository reads a Prisma `Date`. One
    // function has to answer for both, or the UI and the server disagree about
    // the same row.
    expect(
      isProposalStale(
        { baseRevisionId: "head-1", staleAt: "2026-08-06T12:00:00.000Z" },
        "head-1",
      ),
    ).toBe(true);
  });

  it("treats a proposal on an empty document as fresh only while head is null", () => {
    expect(isProposalStale({ baseRevisionId: null, staleAt: null }, null))
      .toBe(false);
    expect(isProposalStale({ baseRevisionId: null, staleAt: null }, "head-1"))
      .toBe(true);
  });
});

describe("planStaleMarking", () => {
  const candidate = (
    over: Partial<Parameters<typeof planStaleMarking>[0][0]> = {},
  ) => ({
    id: "prop-1",
    baseRevisionId: "head-1" as string | null,
    staleAt: null as Date | null,
    ...over,
  });
  const now = at("2026-08-06T12:00:00Z");

  it("marks a proposal whose base stopped being head", () => {
    expect(planStaleMarking([candidate()], "head-2", now))
      .toEqual({ ids: ["prop-1"], at: now });
  });

  it("leaves a proposal whose base is the new head alone", () => {
    expect(planStaleMarking([candidate()], "head-1", now).ids).toEqual([]);
  });

  it("does not re-stamp an already stale row", () => {
    // An editor autosave folds into one revision id, so the same head value is
    // written over and over; re-stamping would walk the timestamp forward for
    // as long as the author kept typing.
    const already = candidate({ staleAt: at("2026-08-06T11:00:00Z") });
    expect(planStaleMarking([already], "head-2", now).ids).toEqual([]);
  });

  it("never marks the row that is becoming head", () => {
    // That head move is an approval, not a save. Approval writes head through
    // its own transaction, so this is a second lock on the same door.
    const approved = candidate({ id: "prop-1", baseRevisionId: "head-1" });
    expect(planStaleMarking([approved], "prop-1", now).ids).toEqual([]);
  });

  it("marks a proposal built on an empty document once head exists", () => {
    // The row a `NOT ("baseRevisionId" = $1)` in SQL would silently skip, since
    // that comparison is unknown — and therefore false — for a null base.
    expect(
      planStaleMarking([candidate({ baseRevisionId: null })], "head-1", now)
        .ids,
    )
      .toEqual(["prop-1"]);
  });

  it("leaves that same proposal alone while head is still null", () => {
    expect(
      planStaleMarking([candidate({ baseRevisionId: null })], null, now).ids,
    )
      .toEqual([]);
  });

  it("answers for every row it is given, not just the first", () => {
    const rows = [
      candidate({ id: "a", baseRevisionId: "head-1" }),
      candidate({ id: "b", baseRevisionId: "head-2" }),
      candidate({ id: "c", baseRevisionId: null }),
    ];
    expect(planStaleMarking(rows, "head-2", now).ids).toEqual(["a", "c"]);
  });
});

describe("foldProposal — replacing a stale proposal", () => {
  const later = batch({
    data: { root: "two" },
    ops: ["op-2"],
    base: "head-2",
    at: at("2026-08-06T11:00:00Z"),
  });

  it("replaces rather than folds when the pending row is stamped stale", () => {
    const plan = foldProposal(
      pending({ staleAt: at("2026-08-06T10:30:00Z") }),
      batch({ ops: ["op-2"], at: at("2026-08-06T11:00:00Z") }),
    );
    if (plan.kind !== "replace") throw new Error("expected a replace");
    expect(plan.replaces).toBe("prop-1");
  });

  it("replaces when the batch stands on a different head, stamp or no stamp", () => {
    const plan = foldProposal(pending({ baseRevisionId: "head-1" }), later);
    expect(plan.kind).toBe("replace");
  });

  it("bases the new proposal on what this batch actually read", () => {
    // Not the old base. The replacement is approvable precisely because it is
    // built on current head; carrying the dead base forward would produce a
    // second unapprovable row.
    const plan = foldProposal(pending({ baseRevisionId: "head-1" }), later);
    expect(plan.row.baseRevisionId).toBe("head-2");
  });

  it("drops the stale row's ops rather than carrying them over", () => {
    // They name blocks in a state that is no longer anywhere: the author's save
    // moved past it, and this batch never saw it either.
    const plan = foldProposal(pending({ ops: ["op-1"] }), later);
    expect(plan.row.ops).toEqual(["op-2"]);
  });

  it("starts a fresh proposal — version 0, proposed now", () => {
    const plan = foldProposal(
      pending({ version: 7, proposedAt: at("2026-08-06T10:00:00Z") }),
      later,
    );
    expect(plan.row.version).toBe(0);
    expect(plan.row.proposedAt).toEqual(at("2026-08-06T11:00:00Z"));
  });
});

describe("planApproval", () => {
  const approvable = { baseRevisionId: "head-1", staleAt: null, version: 3 };

  it("compares against the base, not against whatever head is now", () => {
    const plan = planApproval(approvable);
    if (plan.kind !== "approve") throw new Error("expected an approval");
    expect(plan.expectedHead).toBe("head-1");
  });

  it("clears the pending flag and nothing else", () => {
    const plan = planApproval(approvable);
    if (plan.kind !== "approve") throw new Error("expected an approval");
    expect(plan.patch).toEqual({ proposedAt: null, staleAt: null });
  });

  it("approves a proposal built on no head at all", () => {
    const plan = planApproval({ ...approvable, baseRevisionId: null });
    if (plan.kind !== "approve") throw new Error("expected an approval");
    expect(plan.expectedHead).toBeNull();
  });

  it("refuses a proposal whose base stopped being head", () => {
    expect(
      planApproval({ ...approvable, staleAt: at("2026-08-06T12:00:00Z") }).kind,
    ).toBe("stale");
  });

  // ── The second fence (§3.2's `version`, spent at approval time) ────────────

  it("fences the row itself as well as head", () => {
    // Two compare-and-sets, and neither substitutes for the other: head guards
    // the document against the author's own save, `version` guards the row
    // against a batch landing between the read and the write.
    const plan = planApproval(approvable);
    if (plan.kind !== "approve") throw new Error("expected an approval");
    expect(plan.expectedVersion).toBe(3);
    expect(plan.expectedHead).toBe("head-1");
  });

  it("refuses when the reviewer's hunks came from an older version", () => {
    const plan = planApproval(approvable, { version: 2, rejectedHunks: ["h"] });
    expect(plan.kind).toBe("version-moved");
    if (plan.kind !== "version-moved") throw new Error("expected a refusal");
    // What the row says now, so the caller can report the gap rather than a
    // bare failure.
    expect(plan.version).toBe(3);
  });

  it("accepts a selection pinned to the version the row still holds", () => {
    const plan = planApproval(approvable, { version: 3, rejectedHunks: ["h"] });
    if (plan.kind !== "approve") throw new Error("expected an approval");
    expect(plan.rejected).toEqual(["h"]);
  });

  it("asks staleness before version, because stale is unrecoverable", () => {
    // A stale proposal cannot be approved on *any* version. Answering "your
    // hunks are out of date" would send the reviewer round to recompute a
    // selection over a row that could only ever refuse them.
    expect(
      planApproval(
        { ...approvable, staleAt: at("2026-08-06T12:00:00Z") },
        { version: 2 },
      ).kind,
    ).toBe("stale");
  });

  it("does not pin a version the reviewer never claimed", () => {
    // The whole-proposal approval has nothing to pin: it takes the row as it
    // stands, whatever batch that now includes.
    const plan = planApproval(approvable, { rejectedHunks: [] });
    expect(plan.kind).toBe("approve");
  });

  // ── The decisions themselves ──────────────────────────────────────────────

  it("treats no decisions as the whole proposal", () => {
    const plan = planApproval(approvable);
    if (plan.kind !== "approve") throw new Error("expected an approval");
    expect(plan.rejected).toEqual([]);
  });

  it("never puts anything but the flag clear in the patch", () => {
    // `data` and `summary` are the *repository's* to add, from a state it
    // recomputed. A patch built here could only carry what the client sent.
    const plan = planApproval(approvable, { rejectedHunks: ["a", "b"] });
    if (plan.kind !== "approve") throw new Error("expected an approval");
    expect(Object.keys(plan.patch).sort()).toEqual(["proposedAt", "staleAt"]);
  });

  it("leaves the base alone whatever was refused", () => {
    // The one invariant with no database constraint behind it (§3.2): approval
    // reads `baseRevisionId` and never writes it, partial or not.
    const plan = planApproval(approvable, { rejectedHunks: ["a"] });
    if (plan.kind !== "approve") throw new Error("expected an approval");
    expect(plan.expectedHead).toBe("head-1");
    expect(plan.patch).not.toHaveProperty("baseRevisionId");
  });
});

describe("noteApplied", () => {
  it("says nothing when the whole proposal was taken", () => {
    expect(noteApplied("Rewrote the intro.", 5, 5)).toBe("Rewrote the intro.");
    expect(noteApplied(null, 0, 0)).toBeNull();
  });

  it("appends to the agent's wording rather than replacing it", () => {
    expect(noteApplied("Rewrote the intro.", 3, 5)).toBe(
      "Rewrote the intro. — Applied 3 of 5 proposed changes.",
    );
  });

  it("stands alone when the agent left no summary", () => {
    expect(noteApplied(null, 3, 5)).toBe("Applied 3 of 5 proposed changes.");
  });

  it("records a proposal every part of which was refused", () => {
    expect(noteApplied(null, 0, 4)).toBe("Applied 0 of 4 proposed changes.");
  });
});
