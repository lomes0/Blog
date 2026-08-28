/**
 * Naming what a delete removes (docs/plans/claude-code-backlog.md §5).
 *
 * The claim under test is narrow and entirely about *which* deletes get a
 * sentence: a canvas does, a paragraph does not, and neither an address that no
 * longer resolves nor a node this build cannot read may cost more than its own
 * clause. Everything downstream — a rail row, a review card — renders the string
 * this module returns, so a wrong answer here is a wrong answer on every
 * surface at once.
 */
import { blockToNode } from "@/lib/content-bridge/blocks";
import {
  deletedNodes,
  describeRemovals,
  describeRemovedBlock,
  withRemovalNote,
} from "@/lib/content-bridge/removals";
import type { Op } from "@/lib/content-bridge/ops";
import type { SerializedNode, StoredState } from "@/lib/content-bridge/types";
import { makeCanvasState, makeState, paragraph } from "./fixture";

const table = (rows: number, columns: number): SerializedNode =>
  blockToNode({
    type: "table",
    rowCount: rows,
    columnCount: columns,
    rows: Array.from({ length: rows }, () =>
      Array.from({ length: columns }, () => ({ text: "x" }))),
  });

const image = (caption: string): SerializedNode =>
  blockToNode({ type: "image", src: "/api/blob/abc", alt: "", caption });

const sketch = (): SerializedNode => ({
  type: "sketch",
  version: 1,
  value: "EXCALIDRAW_SCENE",
  src: "data:image/svg+xml,…",
  altText: "",
  width: 400,
  height: 300,
});

const canvasOf = (state: StoredState): SerializedNode =>
  state.root.children![1];

describe("describeRemovals", () => {
  it("names a canvas by how much is on it", () => {
    expect(describeRemovals([canvasOf(makeCanvasState())]))
      .toBe("removes 1 canvas · 2 notes");
  });

  it("names a table by its shape", () => {
    expect(describeRemovals([table(3, 4)]))
      .toBe("removes 1 table · 3 rows × 4 columns");
  });

  it("says nothing about prose — the diff beside it already does", () => {
    expect(describeRemovals([paragraph("a whole paragraph")])).toBeNull();
    expect(describeRemovals([])).toBeNull();
  });

  it("says nothing about a block that holds nothing", () => {
    expect(describeRemovals([{ type: "pagebreak", version: 1 }])).toBeNull();
    expect(describeRemovals([{ type: "horizontalrule", version: 1 }]))
      .toBeNull();
  });

  it("drops the qualifier past one block, and counts by kind", () => {
    expect(describeRemovals([image("one"), image("two"), table(2, 2)]))
      .toBe("removes 2 images and 1 table");
  });

  it("pluralizes the nouns that do not just take an s", () => {
    const canvas = canvasOf(makeCanvasState());
    expect(describeRemovals([canvas, canvas, sketch()]))
      .toBe("removes 2 canvases and 1 sketch");
  });

  it("counts the rest rather than listing every kind", () => {
    const state = makeCanvasState();
    expect(
      describeRemovals([
        canvasOf(state),
        table(1, 1),
        image("a"),
        sketch(),
        { type: "math", version: 1, value: "x^2" },
      ]),
    ).toBe("removes 1 canvas, 1 table, 1 image and 2 others");
  });

  it("keeps prose out of a mixed batch's count", () => {
    expect(describeRemovals([paragraph("gone"), table(2, 2)]))
      .toBe("removes 1 table · 2 rows × 2 columns");
  });

  it("clips a qualifier long enough to crowd out the noun", () => {
    const phrase = describeRemovals([image("x".repeat(200))]);
    expect(phrase).toMatch(/^removes 1 image · x+…$/);
    expect(phrase!.length).toBeLessThan(60);
  });

  it("survives a node whose stored shape it cannot read", () => {
    // Not hypothetical: these states are written by whatever build was current,
    // and the review rail must never be the thing that crashes on one.
    const broken = { type: "canvas", version: 1, notes: "not an array" };
    expect(() => describeRemovals([broken as unknown as SerializedNode]))
      .not.toThrow();
  });
});

describe("describeRemovedBlock", () => {
  it("names one block without the count or the verb", () => {
    expect(describeRemovedBlock(canvasOf(makeCanvasState())))
      .toBe("canvas · 2 notes");
  });

  it("is empty for prose, so a card decorates nothing", () => {
    expect(describeRemovedBlock(paragraph("hello"))).toBe("");
  });
});

describe("deletedNodes", () => {
  const state = makeCanvasState();

  it("resolves a delete against the state its address was written against", () => {
    const ops: Op[] = [{ op: "delete_block", id: "b2" }];
    expect(deletedNodes(state, ops).map((node) => node.type)).toEqual([
      "canvas",
    ]);
  });

  it("ignores every op that is not a delete", () => {
    const ops: Op[] = [
      { op: "set_text", id: "b1", text: "hi" },
      { op: "move_block", id: "b2", after: "b3" },
      { op: "insert_blocks", blocks: [], after: "b1" },
    ];
    expect(deletedNodes(state, ops)).toEqual([]);
  });

  it("skips an address that resolves to nothing rather than throwing", () => {
    // A stale proposal against a document that has since changed. The applier
    // is what refuses that batch; this is only the sentence about it, and it
    // must degrade to saying less rather than to failing.
    const ops: Op[] = [
      { op: "delete_block", id: "b99" },
      { op: "delete_block", id: "blk_nothing" },
      { op: "delete_block", id: "b2" },
    ];
    expect(deletedNodes(state, ops)).toHaveLength(1);
  });

  it("resolves a nested address, so a note is named as well as a board", () => {
    // The note's own descriptor is already a noun phrase, so it is not
    // qualified a second time — `note · yellow note · 2 blocks`.
    const ops: Op[] = [{ op: "delete_block", id: "b2.1" }];
    expect(describeRemovals(deletedNodes(state, ops)))
      .toBe("removes 1 yellow note · 2 blocks");
  });

  it("names a kanban board from the fixture document", () => {
    const ops: Op[] = [{ op: "delete_block", id: "b3" }];
    expect(describeRemovals(deletedNodes(makeState(), ops)))
      .toBe("removes 1 kanban · 2 lanes · 3 cards");
  });
});

describe("withRemovalNote", () => {
  it("leaves an absent summary absent — that means 'keep what is stored'", () => {
    // `foldProposal` reads undefined as "this batch says nothing about the
    // summary". Turning it into a string here would blank an earlier batch's
    // line on every squash.
    expect(withRemovalNote(undefined, null)).toBeUndefined();
    expect(withRemovalNote(null, null)).toBeNull();
  });

  it("stands on its own when there is no summary to append to", () => {
    expect(withRemovalNote(undefined, "removes 1 canvas · 7 notes"))
      .toBe("Removes 1 canvas · 7 notes");
  });

  it("appends rather than replaces when a caller wrote a summary", () => {
    expect(withRemovalNote("Tightened the intro", "removes 1 table"))
      .toBe("Tightened the intro — removes 1 table");
  });
});
