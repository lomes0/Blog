/**
 * The layer between the diff and the review surface
 * (docs/plans/archive/haklex-adoption.md §7).
 *
 * `proposalReview.ts` exists because a hunk list is not a document, and the
 * three claims under test here are the ones a component cannot make for itself
 * in a suite that mounts nothing:
 *
 * **Nothing is lost and nothing is duplicated.** Every block of the proposal
 * and every deleted block of the base appears exactly once in the rows, in
 * document order. A review that silently drops a paragraph is a review of a
 * document nobody wrote.
 *
 * **The top-level alignment is *recovered*, not guessed.** The module rebuilds
 * it from hunk addresses plus the diff's monotonicity, so the fixtures are
 * built by running the real `applyOps` and the real `diffProposal` rather than
 * by hand-writing a plausible hunk array.
 *
 * **A block renders on its own with its ancestors intact.** A changed table
 * cell isolated to the root alone is a bare `<td>`; the ancestor rebuild is
 * what makes it a one-cell table, and it is invisible until someone looks at
 * the screen — hence a spec.
 */
import {
  buildReviewRows,
  decisionCounts,
  isolateBlock,
  isolateBlocks,
  rejectAllHunks,
  rejectedHunkIds,
  toggleRejection,
  type ReviewRow,
} from "@/lib/proposalReview";
import { applyDecisions, diffProposal, type Hunk } from "@/lib/proposalDiff";
import { applyOps, stateFromBlocks, type Op } from "@/lib/content-bridge/ops";
import { stateHash } from "@/lib/content-bridge/stateHash";
import type { SerializedNode, StoredState } from "@/lib/content-bridge/types";
import { makeState, snapshot } from "@/lib/content-bridge/__tests__/fixture";

/** A proposal, produced the way the MCP server produces one. */
const propose = (base: StoredState, ops: Op[]): StoredState =>
  applyOps(base, stateHash(base), ops).state;

const kids = (state: StoredState): SerializedNode[] =>
  state.root.children as SerializedNode[];

/** Rows plus the diff they were built from — every test needs both. */
const review = (base: StoredState, proposal: StoredState) => {
  const hunks = diffProposal(base, proposal);
  return { hunks, rows: buildReviewRows(base, proposal, hunks) };
};

/** A compact shape to assert order against. */
const shapeOf = (rows: ReviewRow[]) =>
  rows.map((row) =>
    row.kind === "context"
      ? { context: row.nodes.length }
      : { change: row.hunk.kind, at: row.hunk.baseAddress ?? row.hunk.proposalAddress }
  );

const prose = (): StoredState =>
  stateFromBlocks([
    { type: "paragraph", text: "One." },
    { type: "paragraph", text: "Two." },
    { type: "paragraph", text: "Three." },
    { type: "paragraph", text: "Four." },
  ]);

// ─── Order and completeness ──────────────────────────────────────────────────

describe("buildReviewRows — the document, in order", () => {
  it("renders an unchanged document as one context run", () => {
    const base = makeState();
    const { rows, hunks } = review(base, JSON.parse(JSON.stringify(base)));
    expect(hunks).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("context");
    expect(shapeOf(rows)).toEqual([{ context: kids(base).length }]);
  });

  it("puts a replaced block between the runs it sits between", () => {
    const base = makeState();
    const proposal = propose(base, [
      { op: "set_text", id: "b2", text: "A much more concrete opening." },
    ]);
    // Seven blocks; the second changed, so one before it and five after.
    expect(shapeOf(review(base, proposal).rows)).toEqual([
      { context: 1 },
      { change: "replace", at: "b2" },
      { context: 5 },
    ]);
  });

  it("places an insert at its proposal position", () => {
    const base = prose();
    const proposal = propose(base, [
      {
        op: "insert_blocks",
        after: "b2",
        blocks: [{ type: "paragraph", text: "Inserted." }],
      },
    ]);
    expect(shapeOf(review(base, proposal).rows)).toEqual([
      { context: 2 },
      { change: "insert", at: "b3" },
      { context: 2 },
    ]);
  });

  it("places a delete at its base position", () => {
    const base = prose();
    const proposal = propose(base, [{ op: "delete_block", id: "b3" }]);
    expect(shapeOf(review(base, proposal).rows)).toEqual([
      { context: 2 },
      { change: "delete", at: "b3" },
      { context: 1 },
    ]);
  });

  it("keeps a delete before the block that follows it, with an insert nearby", () => {
    // The mixed case is where a reconstructed alignment goes wrong quietly:
    // one row too far and the author reads the deletion as applying to the
    // paragraph after it.
    const base = prose();
    const proposal = propose(base, [
      { op: "delete_block", id: "b2" },
      {
        op: "insert_blocks",
        after: "b3",
        blocks: [{ type: "paragraph", text: "New." }],
      },
    ]);
    expect(shapeOf(review(base, proposal).rows)).toEqual([
      { context: 1 },
      { change: "delete", at: "b2" },
      { context: 1 },
      { change: "insert", at: "b3" },
      { context: 1 },
    ]);
  });

  it("accounts for every block exactly once", () => {
    const base = makeState();
    const proposal = propose(base, [
      { op: "set_text", id: "b2", text: "Rewritten." },
      { op: "delete_block", id: "b7" },
      {
        op: "insert_blocks",
        before: "b1",
        blocks: [{ type: "paragraph", text: "A new opening." }],
      },
    ]);
    const { rows, hunks } = review(base, proposal);

    // Every hunk is drawn, once, in diff order.
    const drawn = rows.flatMap((row) =>
      row.kind === "change" ? [row.hunk.id] : []
    );
    expect(drawn).toEqual(hunks.map((hunk) => hunk.id));

    // And the untouched blocks are all there: proposal blocks that are not the
    // right-hand side of a hunk.
    const changedProposal = new Set(
      hunks.flatMap((hunk) => hunk.proposal ? [snapshot(hunk.proposal)] : []),
    );
    const context = rows.flatMap((row) =>
      row.kind === "context" ? row.nodes.map(snapshot) : []
    );
    expect(context).toEqual(
      kids(proposal).map(snapshot).filter((node) => !changedProposal.has(node)),
    );
  });

  it("reads a proposal against an empty document as one insert per block", () => {
    const empty: StoredState = {
      root: { type: "root", version: 1, indent: 0, format: "", children: [] },
    };
    const rows = buildReviewRows(empty, prose(), diffProposal(empty, prose()));
    expect(rows.every((row) => row.kind === "change")).toBe(true);
    expect(rows).toHaveLength(4);
  });
});

// ─── Nesting ─────────────────────────────────────────────────────────────────

describe("buildReviewRows — hunks inside a container", () => {
  const tableState = (): StoredState =>
    stateFromBlocks([
      { type: "paragraph", text: "Before." },
      {
        type: "table",
        rowCount: 2,
        columnCount: 2,
        rows: [["a", "b"], ["c", "d"]],
      },
      { type: "paragraph", text: "After." },
    ]);

  it("names the container a nested hunk sits in", () => {
    const base = tableState();
    const proposal = propose(base, [
      { op: "set_text", id: "b2.2.1", text: "changed" },
    ]);
    const { rows } = review(base, proposal);
    expect(shapeOf(rows)).toEqual([
      { context: 1 },
      { change: "replace", at: "b2.2.1" },
      { context: 1 },
    ]);
    const [, change] = rows;
    expect(change.kind === "change" && change.container).toBe("blog-table");
  });

  it("leaves a top-level hunk unlabelled", () => {
    const base = prose();
    const proposal = propose(base, [
      { op: "set_text", id: "b2", text: "Two, revised." },
    ]);
    const [, change] = review(base, proposal).rows;
    expect(change.kind === "change" && change.container).toBe(null);
  });

  it("keeps a container paired when its only nested hunk is one-sided", () => {
    // The case the reconstruction cannot read off a hunk's two addresses: a
    // deleted table row names a base address and no proposal one, so the table
    // is paired only by the leftovers-in-order rule. Getting this wrong reads
    // the whole table as deleted and the paragraph after it as inserted.
    const base = tableState();
    const proposal = JSON.parse(JSON.stringify(base)) as StoredState;
    (kids(proposal)[1].children as SerializedNode[]).splice(1, 1);

    const { hunks, rows } = review(base, proposal);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].kind).toBe("delete");
    expect(hunks[0].depth).toBe(1);
    expect(shapeOf(rows)).toEqual([
      { context: 1 },
      { change: "delete", at: "b2.2" },
      { context: 1 },
    ]);
    const [, change] = rows;
    expect(change.kind === "change" && change.container).toBe("blog-table");
  });

  it("descends into a layout column without losing the columns around it", () => {
    const base = makeState();
    const proposal = propose(base, [
      { op: "set_text", id: "b4.1.1", text: "left column, rewritten" },
    ]);
    const { rows } = review(base, proposal);
    expect(shapeOf(rows)).toEqual([
      { context: 3 },
      { change: "replace", at: "b4.1.1" },
      { context: 3 },
    ]);
    const [, change] = rows;
    expect(change.kind === "change" && change.container).toBe(
      "layout-container",
    );
  });
});

// ─── Isolation ───────────────────────────────────────────────────────────────

describe("isolateBlock — one block, renderable alone", () => {
  it("puts a top-level block under a root of its own", () => {
    const base = makeState();
    const isolated = isolateBlock(base, "b2", kids(base)[1]);
    expect(isolated).not.toBe(null);
    expect(kids(isolated!)).toHaveLength(1);
    expect(snapshot(kids(isolated!)[0])).toBe(snapshot(kids(base)[1]));
    // The root's own fields survive: direction and format decide how the
    // isolated block renders.
    expect(isolated!.root.type).toBe("root");
    expect(isolated!.root.format).toBe(base.root.format);
  });

  it("rebuilds a nested block's ancestors and drops its siblings", () => {
    const base = makeState();
    // b4.2.1 is the graph in the second layout column.
    const layout = kids(base)[3];
    const column = (layout.children as SerializedNode[])[1];
    const graph = (column.children as SerializedNode[])[0];

    const isolated = isolateBlock(base, "b4.2.1", graph)!;
    const [outer] = kids(isolated);
    expect(outer.type).toBe("layout-container");
    // The template is kept — it is what gives the column its width — while the
    // sibling column is gone.
    expect(outer.templateColumns).toBe(layout.templateColumns);
    expect(outer.children).toHaveLength(1);

    const [inner] = outer.children as SerializedNode[];
    expect(inner.type).toBe("layout-item");
    expect(inner.children).toHaveLength(1);
    expect(snapshot((inner.children as SerializedNode[])[0])).toBe(
      snapshot(graph),
    );
  });

  it("does not mutate the state it isolates from", () => {
    const base = makeState();
    const before = snapshot(base);
    isolateBlock(base, "b4.1.1", { type: "paragraph", version: 1 });
    expect(snapshot(base)).toBe(before);
  });

  it("answers null rather than guessing at an address it cannot resolve", () => {
    const base = makeState();
    expect(isolateBlock(base, null, kids(base)[0])).toBe(null);
    expect(isolateBlock(base, "not-an-address", kids(base)[0])).toBe(null);
    expect(isolateBlock(base, "b99.1.1", kids(base)[0])).toBe(null);
  });

  it("renders a context run as one state", () => {
    const base = makeState();
    const run = kids(base).slice(0, 2);
    expect(kids(isolateBlocks(base, run))).toHaveLength(2);
    expect(snapshot(kids(isolateBlocks(base, run)))).toBe(snapshot(run));
  });
});

// ─── Decisions ───────────────────────────────────────────────────────────────

describe("decisions", () => {
  const base = prose();
  const proposal = propose(base, [
    { op: "set_text", id: "b1", text: "One, revised." },
    {
      op: "insert_blocks",
      after: "b2",
      blocks: [{ type: "paragraph", text: "Inserted." }],
    },
    { op: "delete_block", id: "b4" },
  ]);
  const hunks: Hunk[] = diffProposal(base, proposal);

  it("toggles one hunk without touching the others", () => {
    const once = toggleRejection(new Set<string>(), hunks[1].id);
    expect([...once]).toEqual([hunks[1].id]);
    expect([...toggleRejection(once, hunks[1].id)]).toEqual([]);
    expect([...toggleRejection(once, hunks[0].id)].sort()).toEqual(
      [hunks[0].id, hunks[1].id].sort(),
    );
  });

  it("does not mutate the set it is given", () => {
    const start = new Set([hunks[0].id]);
    toggleRejection(start, hunks[1].id);
    expect([...start]).toEqual([hunks[0].id]);
  });

  it("counts over the current hunk set", () => {
    expect(decisionCounts(hunks, new Set())).toEqual({
      total: 3,
      accepted: 3,
      refused: 0,
    });
    expect(decisionCounts(hunks, rejectAllHunks(hunks))).toEqual({
      total: 3,
      accepted: 0,
      refused: 3,
    });
  });

  it("sends the refused ids in diff order", () => {
    const rejected = new Set([hunks[2].id, hunks[0].id]);
    expect(rejectedHunkIds(hunks, rejected)).toEqual([
      hunks[0].id,
      hunks[2].id,
    ]);
  });

  it("drops a decision about a hunk the diff no longer contains", () => {
    // A re-fetch can retire a hunk. Sending its id would be a 400 the server
    // is right to make about a genuine disagreement and wrong to make about a
    // stale checkbox.
    const rejected = new Set([hunks[0].id, "replace:-|b99"]);
    expect(rejectedHunkIds(hunks, rejected)).toEqual([hunks[0].id]);
  });

  it("round-trips through applyDecisions — refuse everything, get the base", () => {
    // The end-to-end claim the surface rests on: what the bar's Reject-all
    // sends is exactly what the server can interpret back into the document.
    const ids = rejectedHunkIds(hunks, rejectAllHunks(hunks));
    expect(snapshot(applyDecisions(base, proposal, ids))).toBe(snapshot(base));
    expect(snapshot(applyDecisions(base, proposal, []))).toBe(
      snapshot(proposal),
    );
  });
});
