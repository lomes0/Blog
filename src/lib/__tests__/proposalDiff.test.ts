/**
 * The block diff per-hunk proposal review is built on
 * (docs/plans/archive/haklex-adoption.md §7).
 *
 * Two claims are under test, and the module is worthless without either.
 *
 * **The diff is exact.** `applyOps` copies untouched subtrees verbatim, so a
 * one-paragraph edit in an eight-block document must produce exactly one hunk —
 * not "mostly one", not "one plus some re-serialization noise". Every fixture
 * here is therefore built by running the *real* `applyOps` against the *real*
 * bridge fixture, not by hand-writing a plausible pair of states.
 *
 * **The decision round-trips.** The client sends hunk ids back and the server
 * recomputes the diff to interpret them, so ids have to be a pure function of
 * the two states, and rejecting everything has to land back on the base
 * document byte for byte.
 */
import {
  applyDecisions,
  diffProposal,
  UnknownHunkError,
  type Hunk,
} from "@/lib/proposalDiff";
import { applyOps, stateFromBlocks, type Op } from "@/lib/content-bridge/ops";
import { stateHash } from "@/lib/content-bridge/stateHash";
import { readBlockId } from "@/lib/content-bridge/blockId";
import { walkBlocks } from "@/lib/content-bridge/address";
import type { SerializedNode, StoredState } from "@/lib/content-bridge/types";
import {
  makeState,
  makeStickyState,
  snapshot,
} from "@/lib/content-bridge/__tests__/fixture";

/** A proposal, produced the way the MCP server produces one. */
const propose = (base: StoredState, ops: Op[]): StoredState =>
  applyOps(base, stateHash(base), ops).state;

/** A document whose blocks all carry ids — what a second agent batch sees. */
const stamped = (): StoredState =>
  stateFromBlocks([
    { type: "paragraph", text: "One." },
    { type: "paragraph", text: "Two." },
    { type: "paragraph", text: "Three." },
    { type: "paragraph", text: "Four." },
  ]);

const kids = (state: StoredState): SerializedNode[] =>
  state.root.children as SerializedNode[];

const texts = (state: StoredState): string[] =>
  kids(state).map((node) =>
    ((node.children as SerializedNode[])[0]?.text as string) ?? "",
  );

const shapeOf = (hunks: Hunk[]) =>
  hunks.map((hunk) => ({ kind: hunk.kind, base: hunk.baseAddress }));

/** A round-trip through storage — the server reads rows, it does not share objects. */
const stored = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// ─── The property the whole design leans on ──────────────────────────────────

describe("diffProposal — exactness", () => {
  it("reduces a prose edit in a rich document to one hunk", () => {
    const base = makeState();
    const before = snapshot(base);
    const proposal = propose(base, [
      { op: "set_text", id: "b2", text: "A much more concrete opening." },
    ]);

    // The premise, restated as an assertion: every block but one comes back
    // byte-identical, so deep equality per block is an exact changed-detector.
    const untouched = [0, 2, 3, 4, 5, 6];
    for (const index of untouched) {
      expect(snapshot(kids(proposal)[index])).toBe(snapshot(kids(base)[index]));
    }

    const hunks = diffProposal(base, proposal);
    expect(shapeOf(hunks)).toEqual([{ kind: "replace", base: "b2" }]);
    expect(hunks[0].depth).toBe(0);
    // Diffing reads; it must not write.
    expect(snapshot(base)).toBe(before);
  });

  it("sees nothing between a state and itself", () => {
    const base = makeState();
    expect(diffProposal(base, stored(base))).toEqual([]);
  });

  it("reads a proposal against an empty document as one insert per block", () => {
    const empty: StoredState = {
      root: { type: "root", version: 1, indent: 0, format: "", children: [] },
    };
    const hunks = diffProposal(empty, stamped());
    expect(hunks.map((hunk) => hunk.kind)).toEqual(
      new Array(4).fill("insert"),
    );
    expect(hunks.every((hunk) => hunk.base === null)).toBe(true);
  });
});

// ─── Hunk ids ────────────────────────────────────────────────────────────────

describe("diffProposal — hunk ids", () => {
  const base = stamped();
  const proposal = propose(base, [
    { op: "set_text", id: "b1", text: "One, revised." },
    { op: "insert_blocks", after: "b1", blocks: [
      { type: "paragraph", text: "Inserted." },
    ] },
    { op: "delete_block", id: "b4" },
  ]);

  it("computes the same ids from the same two states, twice", () => {
    const first = diffProposal(base, proposal).map((hunk) => hunk.id);
    const second = diffProposal(base, proposal).map((hunk) => hunk.id);
    expect(second).toEqual(first);
  });

  it("survives the round-trip through storage the server makes", () => {
    // The client diffs objects it holds; the server diffs rows it just read.
    // Nothing in an id may come from a clock, a counter or object identity.
    const fromRows = diffProposal(stored(base), stored(proposal));
    expect(fromRows.map((hunk) => hunk.id)).toEqual(
      diffProposal(base, proposal).map((hunk) => hunk.id),
    );
  });

  it("carries the block id and the address it was computed from", () => {
    const [replace] = diffProposal(base, proposal);
    const id = readBlockId(kids(base)[0]);
    expect(id).toMatch(/^blk_/);
    expect(replace.id).toBe(`replace:${id}|b1`);
    expect(replace.blockId).toBe(id);
  });

  it("keeps ids distinct across every kind and depth", () => {
    const hunks = diffProposal(base, proposal);
    expect(new Set(hunks.map((hunk) => hunk.id)).size).toBe(hunks.length);
    expect(hunks.map((hunk) => hunk.kind)).toEqual([
      "replace",
      "insert",
      "delete",
    ]);
  });

  it("names an unstamped deleted block by its base address", () => {
    // A block nobody ever edited has no id, which is the case the address half
    // of the id format exists for.
    const plain = makeState();
    const hunks = diffProposal(plain, propose(plain, [
      { op: "delete_block", id: "b7" },
    ]));
    expect(hunks.map((hunk) => hunk.id)).toEqual(["delete:-|b7"]);
  });
});

// ─── Container recursion ─────────────────────────────────────────────────────

describe("diffProposal — containers", () => {
  const tableState = (): StoredState =>
    stateFromBlocks([
      { type: "paragraph", text: "Before." },
      {
        type: "table",
        rowCount: 2,
        columnCount: 2,
        rows: [["a", "b"], ["c", "d"]],
      },
    ]);

  /** The cell at (row, column) of the table these fixtures put at `b2`. */
  const cell = (state: StoredState, row: number, column: number) =>
    ((kids(state)[1].children as SerializedNode[])[row]
      .children as SerializedNode[])[column];

  it("reduces a one-cell edit to a cell hunk, not a whole-table hunk", () => {
    const base = tableState();
    const proposal = propose(base, [
      { op: "set_text", id: "b2.2.1", text: "changed" },
    ]);

    const hunks = diffProposal(base, proposal);
    expect(hunks).toHaveLength(1);
    const [hunk] = hunks;
    expect(hunk.kind).toBe("replace");
    expect(hunk.baseAddress).toBe("b2.2.1");
    // table (0) -> row (1) -> cell (2): the depth `address.ts` addresses to.
    expect(hunk.depth).toBe(2);
    expect(hunk.base?.type).toBe("blog-tablecell");
    expect(snapshot(hunk.proposal)).not.toBe(snapshot(hunk.base));
  });

  it("descends into a layout column rather than replacing the layout", () => {
    const base = makeState();
    const proposal = propose(base, [
      { op: "set_text", id: "b4.1.1", text: "left column, rewritten" },
    ]);
    expect(shapeOf(diffProposal(base, proposal))).toEqual([
      { kind: "replace", base: "b4.1.1" },
    ]);
  });

  it("replaces the whole container when its own fields moved too", () => {
    // Accepting a cell edit while rejecting a change to the table itself is
    // not a state either side proposed, so the block is reviewed whole.
    const base = tableState();
    const proposal = stored(base);
    const table = kids(proposal)[1];
    table.colWidths = [200, 200];
    ((table.children as SerializedNode[])[1].children as SerializedNode[])[0]
      .backgroundColor = "#eee";

    expect(shapeOf(diffProposal(base, proposal))).toEqual([
      { kind: "replace", base: "b2" },
    ]);
  });

  it("restores one cell while keeping the rest of the table", () => {
    const base = tableState();
    const proposal = propose(base, [
      { op: "set_text", id: "b2.1.1", text: "A" },
      { op: "set_text", id: "b2.2.2", text: "D" },
    ]);
    const hunks = diffProposal(base, proposal);
    expect(hunks).toHaveLength(2);

    const merged = applyDecisions(base, proposal, [hunks[0].id]);
    // The rejected cell is the base's, the accepted one the proposal's, and
    // the two rows around them are untouched.
    expect(snapshot(cell(merged, 0, 0))).toBe(snapshot(cell(base, 0, 0)));
    expect(snapshot(cell(merged, 1, 1))).toBe(snapshot(cell(proposal, 1, 1)));
    expect(snapshot(cell(merged, 0, 1))).toBe(snapshot(cell(base, 0, 1)));
  });
});

// ─── applyDecisions ──────────────────────────────────────────────────────────

describe("applyDecisions — the two ends", () => {
  const base = makeState();
  const proposal = propose(base, [
    { op: "set_text", id: "b2", text: "Rewritten." },
    { op: "insert_blocks", after: "b2", blocks: [
      { type: "quote", text: "An epigraph." },
    ] },
    { op: "delete_block", id: "b7" },
  ]);

  it("rejecting nothing gives the proposal back", () => {
    expect(snapshot(applyDecisions(base, proposal, []))).toBe(
      snapshot(proposal),
    );
  });

  it("rejecting everything gives the base back", () => {
    const all = diffProposal(base, proposal).map((hunk) => hunk.id);
    expect(all).toHaveLength(3);
    expect(snapshot(applyDecisions(base, proposal, all))).toBe(snapshot(base));
  });

  it("shares no structure with either input", () => {
    const hunks = diffProposal(base, proposal);
    const merged = applyDecisions(base, proposal, [hunks[0].id]);
    merged.root.children = [];
    expect(kids(base)).toHaveLength(7);
    expect(kids(proposal)).toHaveLength(7);
  });

  it("emits the same hunks whatever the author decided", () => {
    // The alignment does not read the decisions, so every id stays valid — the
    // property that lets one walk serve both the diff and the materializer.
    const all = diffProposal(base, proposal).map((hunk) => hunk.id);
    for (const id of all) {
      expect(() => applyDecisions(base, proposal, [id])).not.toThrow();
    }
    expect(() => applyDecisions(base, proposal, all)).not.toThrow();
  });
});

describe("applyDecisions — per kind", () => {
  it("restores a rejected replace verbatim, base blockId included", () => {
    const base = stamped();
    const proposal = propose(base, [
      { op: "set_text", id: "b2", text: "Two, revised." },
    ]);
    const [hunk] = diffProposal(base, proposal);

    // The proposal keeps the id — `blocks.ts` carries `$` through a same-type
    // rewrite — so the restored node must be the *base* node, not the proposal
    // node with its text put back.
    const merged = applyDecisions(base, proposal, [hunk.id]);
    expect(snapshot(kids(merged)[1])).toBe(snapshot(kids(base)[1]));
    expect(readBlockId(kids(merged)[1])).toBe(readBlockId(kids(base)[1]));
  });

  it("never hands back an id no stored revision ever had", () => {
    // An agent's next read walks the merged state. An id minted for a block
    // the author refused would name something that does not exist.
    const base = makeState();
    const proposal = propose(base, [
      { op: "set_text", id: "b2", text: "Rewritten." },
    ]);
    const [hunk] = diffProposal(base, proposal);
    const merged = applyDecisions(base, proposal, [hunk.id]);

    const minted = new Set(
      walkBlocks(proposal).map((entry) => readBlockId(entry.node)),
    );
    minted.delete("");
    expect(minted.size).toBe(1);
    const survivors = walkBlocks(merged)
      .map((entry) => readBlockId(entry.node))
      .filter(Boolean);
    expect(survivors).toEqual([]);
  });

  it("drops a rejected insert and keeps an accepted one", () => {
    const base = stamped();
    const proposal = propose(base, [
      { op: "insert_blocks", after: "b1", blocks: [
        { type: "paragraph", text: "Alpha." },
      ] },
      { op: "insert_blocks", after: "b3", blocks: [
        { type: "paragraph", text: "Beta." },
      ] },
    ]);
    const hunks = diffProposal(base, proposal);
    expect(hunks.map((hunk) => hunk.kind)).toEqual(["insert", "insert"]);

    expect(texts(applyDecisions(base, proposal, [hunks[0].id]))).toEqual([
      "One.",
      "Two.",
      "Three.",
      "Beta.",
      "Four.",
    ]);
  });

  it("puts a rejected delete back at its base position", () => {
    const base = stamped();
    const proposal = propose(base, [
      { op: "delete_block", id: "b2" },
      { op: "delete_block", id: "b3" },
    ]);
    const hunks = diffProposal(base, proposal);
    expect(hunks.map((hunk) => hunk.baseAddress)).toEqual(["b2", "b3"]);

    expect(texts(applyDecisions(base, proposal, [hunks[1].id]))).toEqual([
      "One.",
      "Three.",
      "Four.",
    ]);
  });

  it("honours an accepted hunk sitting between two rejected ones", () => {
    const base = stamped();
    const proposal = propose(base, [
      { op: "set_text", id: "b1", text: "One, revised." },
      { op: "insert_blocks", after: "b1", blocks: [
        { type: "paragraph", text: "Inserted." },
      ] },
      { op: "set_text", id: "b3", text: "Three, revised." },
    ]);
    const hunks = diffProposal(base, proposal);
    expect(hunks.map((hunk) => hunk.kind)).toEqual([
      "replace",
      "insert",
      "replace",
    ]);

    const merged = applyDecisions(
      base,
      proposal,
      [hunks[0].id, hunks[2].id],
    );
    expect(texts(merged)).toEqual([
      "One.",
      "Inserted.",
      "Two.",
      "Three.",
      "Four.",
    ]);
    expect(snapshot(kids(merged)[0])).toBe(snapshot(kids(base)[0]));
    expect(snapshot(kids(merged)[3])).toBe(snapshot(kids(base)[2]));
  });
});

// ─── Alignment without ids ───────────────────────────────────────────────────

describe("alignment", () => {
  it("pairs an unstamped block with its stamped rewrite", () => {
    // Nothing in `makeState` carries an id. The proposal stamps only what it
    // touched, so tier 1 has no anchors at all and the fallback has to work.
    const base = makeState();
    expect(walkBlocks(base).every((entry) => !readBlockId(entry.node)))
      .toBe(true);

    const proposal = propose(base, [
      { op: "set_text", id: "b2", text: "Rewritten." },
      { op: "insert_blocks", after: "b2", blocks: [
        { type: "paragraph", text: "And a new one." },
      ] },
    ]);

    const hunks = diffProposal(base, proposal);
    expect(shapeOf(hunks)).toEqual([
      { kind: "replace", base: "b2" },
      { kind: "insert", base: null },
    ]);
    // With no base-side id the proposal's stands in, so the hunk still names a
    // block rather than only a position.
    expect(hunks[0].blockId).toBe(readBlockId(kids(proposal)[1]));
  });

  it("reads a move as a delete beside an insert", () => {
    // Alignment is monotone by construction — an LCS per tier — so a crossing
    // pair is unrepresentable rather than half-applied.
    const base = stamped();
    const proposal = propose(base, [
      { op: "move_block", id: "b1", after: "b4" },
    ]);
    const hunks = diffProposal(base, proposal);
    expect(hunks.map((hunk) => hunk.kind)).toEqual(["delete", "insert"]);
    expect(hunks[0].blockId).toBe(hunks[1].blockId);

    expect(texts(applyDecisions(base, proposal, []))).toEqual([
      "Two.",
      "Three.",
      "Four.",
      "One.",
    ]);
    const all = hunks.map((hunk) => hunk.id);
    expect(snapshot(applyDecisions(base, proposal, all))).toBe(snapshot(base));
  });

  it("pins the unchanged skeleton by content when nothing is stamped", () => {
    const base = makeState();
    const proposal = stored(base);
    // Two identical paragraphs would defeat a naive positional walk; the
    // content tier matches them and leaves the edit isolated.
    kids(proposal).splice(1, 0, stored(kids(base)[1]));
    expect(shapeOf(diffProposal(base, proposal))).toEqual([
      { kind: "insert", base: null },
    ]);
  });
});

/**
 * A container whose children are not at `children` (haklex-reprise §3).
 *
 * `sticky` joined `BLOCK_CONTAINERS` in phase 1, so it now reaches `canRecurse`
 * — but this module reads `node.children` and writes it back the same way, and
 * a note's blocks live at `editor.editorState.root.children`. The reason that
 * is safe rather than merely lucky is `ownPropsEqual`: `editor` is one of the
 * note's own fields, so any nested edit fails the recursion test and the note
 * reviews as a single whole-block hunk.
 *
 * Pinned, because the tempting "fix" — pointing this module at the bridge's
 * `childrenOf` — would make the merge read the nested array and write the
 * result back at `children`, where the editor never looks. See the note on
 * `childrenOf` in `proposalDiff.ts`.
 */
describe("diffProposal — a nested editor reviews as one block", () => {
  it("reduces an edit inside a sticky note to a single whole-block hunk", () => {
    const base = makeStickyState();
    const proposal = propose(base, [
      { op: "set_text", id: "b2.1", text: "rewritten by an agent" },
    ]);

    const hunks = diffProposal(base, proposal);
    expect(shapeOf(hunks)).toEqual([{ kind: "replace", base: "b2" }]);
    expect(hunks[0].depth).toBe(0);
    // Not the note's inner paragraph: the hunk carries the whole note.
    expect(hunks[0].proposal?.type).toBe("sticky");
    // And the blocks either side of it produced nothing.
    expect(snapshot(kids(proposal)[0])).toBe(snapshot(kids(base)[0]));
    expect(snapshot(kids(proposal)[2])).toBe(snapshot(kids(base)[2]));
  });

  it("gives the base note back verbatim when the hunk is rejected", () => {
    const base = makeStickyState();
    const before = snapshot(base);
    const proposal = propose(base, [
      { op: "set_text", id: "b2.1", text: "rewritten by an agent" },
    ]);
    const [hunk] = diffProposal(base, proposal);

    const merged = applyDecisions(stored(base), stored(proposal), [hunk.id]);
    expect(snapshot(merged)).toBe(before);
  });
});

// ─── Input validation ────────────────────────────────────────────────────────

describe("applyDecisions — validation", () => {
  const base = stamped();
  const proposal = propose(base, [
    { op: "set_text", id: "b1", text: "One, revised." },
  ]);

  it("refuses a hunk id this diff does not contain", () => {
    expect(() => applyDecisions(base, proposal, ["replace:blk_nope|b1"]))
      .toThrow(UnknownHunkError);
  });

  it("names every unknown id, so a 400 can say which", () => {
    let caught: UnknownHunkError | null = null;
    try {
      applyDecisions(base, proposal, ["zzz", "aaa"]);
    } catch (error) {
      caught = error as UnknownHunkError;
    }
    expect(caught).toBeInstanceOf(UnknownHunkError);
    expect(caught?.ids).toEqual(["aaa", "zzz"]);
    expect(caught?.message).toContain("aaa, zzz");
  });

  it("refuses a real id belonging to a different pair of states", () => {
    // The server recomputes the diff rather than trusting the client's. An id
    // from a stale diff must not silently mean "reject the block now at b1".
    const other = stamped();
    const otherProposal = propose(other, [
      { op: "set_text", id: "b1", text: "One, revised." },
    ]);
    const [stale] = diffProposal(other, otherProposal);
    expect(() => applyDecisions(base, proposal, [stale.id]))
      .toThrow(UnknownHunkError);
  });
});
