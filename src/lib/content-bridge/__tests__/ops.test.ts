/**
 * The central claim of docs/plans/claude-code-lexical.md, under test.
 *
 * §4.1: *losslessness comes from addressing, not from format coverage.* The
 * applier touches only the nodes an op names, so a kanban board or a GeoGebra
 * graph nobody mentioned has to come out identical — not "mostly intact", not
 * "re-serialized equivalently", identical. If that holds, the IR never needs to
 * grow a codec for those types on correctness grounds.
 */
import { applyOps, type Op } from "@/lib/content-bridge/ops";
import { stateHash } from "@/lib/content-bridge/stateHash";
import { nodeToBlock } from "@/lib/content-bridge/blocks";
import { outline } from "@/lib/content-bridge/outline";
import type { SerializedNode, StoredState } from "@/lib/content-bridge/types";
import { makeState, snapshot } from "./fixture";

const at = (state: StoredState, index: number): SerializedNode =>
  (state.root.children as SerializedNode[])[index];

const apply = (state: StoredState, ops: Op[]) =>
  applyOps(state, stateHash(state), ops);

describe("applyOps — preservation", () => {
  it("leaves untouched rich blocks byte-identical after a prose edit", () => {
    const state = makeState();
    const before = {
      kanban: snapshot(at(state, 2)),
      layout: snapshot(at(state, 3)),
      code: snapshot(at(state, 4)),
      list: snapshot(at(state, 5)),
      pagebreak: snapshot(at(state, 6)),
    };

    const result = apply(state, [
      { op: "set_text", id: "b2", text: "A much more concrete opening." },
    ]);

    expect(snapshot(at(result.state, 2))).toBe(before.kanban);
    expect(snapshot(at(result.state, 3))).toBe(before.layout);
    expect(snapshot(at(result.state, 4))).toBe(before.code);
    expect(snapshot(at(result.state, 5))).toBe(before.list);
    expect(snapshot(at(result.state, 6))).toBe(before.pagebreak);
    expect(nodeToBlock(at(result.state, 1))).toMatchObject({
      text: "A much more concrete opening.",
    });
  });

  it("does not mutate the state it was given", () => {
    const state = makeState();
    const before = snapshot(state);
    apply(state, [{ op: "set_text", id: "b2", text: "changed" }]);
    expect(snapshot(state)).toBe(before);
  });

  it("preserves fields the IR does not model (§4.6.1 carry-through)", () => {
    const state = makeState();
    // The app's code node carries width and wrap; the IR knows only language
    // and body, so a naive rebuild would silently drop them.
    const result = apply(state, [{ op: "set_text", id: "b5", text: "const z = 3;" }]);
    const code = at(result.state, 4);
    expect(code.width).toBe(640);
    expect(code.wrap).toBe(true);
    expect(code.language).toBe("ts");
    expect(nodeToBlock(code)).toMatchObject({ code: "const z = 3;" });
  });

  it("carries through on replace_block too, but not across node types", () => {
    const state = makeState();
    const kept = apply(state, [
      { op: "replace_block", id: "b5", block: { type: "code", language: "py", code: "x = 1" } },
    ]);
    expect(at(kept.state, 4).width).toBe(640);

    // Replacing a code block with a paragraph must not smuggle code fields over.
    const swapped = apply(state, [
      { op: "replace_block", id: "b5", block: { type: "paragraph", text: "prose now" } },
    ]);
    expect(at(swapped.state, 4).width).toBeUndefined();
    expect(at(swapped.state, 4).type).toBe("paragraph");
  });
});

describe("applyOps — the freshness guard", () => {
  it("refuses a batch whose hash no longer matches", () => {
    const state = makeState();
    expect(() => applyOps(state, "h_deadbeefdeadbeef", [
      { op: "set_text", id: "b2", text: "x" },
    ])).toThrow(/changed since it was read/);
  });

  it("returns a new hash that guards the next batch", () => {
    const state = makeState();
    const first = apply(state, [{ op: "set_text", id: "b2", text: "one" }]);
    expect(first.stateHash).not.toBe(stateHash(state));
    // The returned hash is the one the next batch must carry.
    expect(() =>
      applyOps(first.state, first.stateHash, [{ op: "set_text", id: "b2", text: "two" }]),
    ).not.toThrow();
  });
});

describe("applyOps — snapshot addressing", () => {
  it("keeps addresses meaning what they meant at read time", () => {
    const state = makeState();
    // Deleting b2 shifts every later block up by one. b5 must still mean the
    // code block it named in the read, not whatever now sits at that index.
    const result = apply(state, [
      { op: "delete_block", id: "b2" },
      { op: "set_text", id: "b5", text: "const shifted = true;" },
    ]);
    const types = (result.state.root.children as SerializedNode[]).map((n) => n.type);
    expect(types).toEqual(["heading", "kanban", "layout-container", "code", "list", "pagebreak"]);
    expect(nodeToBlock(at(result.state, 3))).toMatchObject({
      code: "const shifted = true;",
    });
  });

  it("reports a block removed earlier in the same batch", () => {
    const state = makeState();
    expect(() =>
      apply(state, [
        { op: "delete_block", id: "b2" },
        { op: "set_text", id: "b2", text: "gone" },
      ]),
    ).toThrow(/removed earlier in this batch/);
  });
});

describe("applyOps — atomicity", () => {
  it("applies nothing when a later op fails", () => {
    const state = makeState();
    const before = snapshot(state);
    expect(() =>
      apply(state, [
        { op: "set_text", id: "b2", text: "this one is fine" },
        { op: "set_text", id: "b99", text: "this one is not" },
      ]),
    ).toThrow(/no block at "b99"/);
    expect(snapshot(state)).toBe(before);
  });

  it("names the failing op by position", () => {
    const state = makeState();
    expect(() =>
      apply(state, [
        { op: "set_text", id: "b2", text: "ok" },
        { op: "replace_block", id: "b1", block: { type: "heading", level: 9, text: "x" } as never },
      ]),
    ).toThrow(/op 2: heading level must be 1-6/);
  });
});

describe("applyOps — what may not be rewritten", () => {
  it("refuses to set text on a block with no codec", () => {
    const state = makeState();
    // b4.2.1 is a graph — a GeoGebra state blob that will never have a codec.
    expect(() => apply(state, [{ op: "set_text", id: "b4.2.1", text: "nope" }])).toThrow(
      /graph, which has no codec/,
    );
  });

  it("refuses set_text on a block that has no single text field", () => {
    const state = makeState();
    expect(() => apply(state, [{ op: "set_text", id: "b3", text: "nope" }])).toThrow(
      /kanban block has no single text field/,
    );
  });

  it("still allows moving and deleting a block with no codec", () => {
    const state = makeState();
    const moved = apply(state, [{ op: "move_block", id: "b4.2.1", before: "b1" }]);
    const landed = (moved.state.root.children as SerializedNode[])[0];
    expect(landed.type).toBe("graph");

    // Its content survived the trip untouched. A move stamps the block with a
    // persistent id — that is exactly the case an id is for — so compare
    // everything except the node-state key.
    const original = (at(makeState(), 3).children as SerializedNode[])[1];
    const stripId = (node: SerializedNode) => {
      const { $: _state, ...rest } = node as Record<string, unknown>;
      return JSON.stringify(rest);
    };
    expect(stripId(landed)).toBe(
      stripId((original.children as SerializedNode[])[0]),
    );
    expect(String(landed.$ && (landed.$ as Record<string, unknown>).blockId))
      .toMatch(/^blk_/);

    const deleted = apply(state, [{ op: "delete_block", id: "b4.2.1" }]);
    expect(JSON.stringify(deleted.state)).not.toContain("GEOGEBRA_STATE_BLOB");
  });

  it("refuses to flatten inline formatting it cannot express", () => {
    const state = makeState();
    // An inline text colour has no spelling in the restricted Markdown, so the
    // block is text-opaque and set_text must refuse rather than lose it.
    const target = at(state, 1);
    target.children = [
      { type: "text", version: 1, text: "coloured", detail: 0, format: 0, mode: "normal", style: "color: #f00" },
    ];
    expect(() =>
      applyOps(state, stateHash(state), [{ op: "set_text", id: "b2", text: "x" }]),
    ).toThrow(/cannot express/);
  });

  it("points at replace_block for lists", () => {
    const state = makeState();
    expect(() => apply(state, [{ op: "set_text", id: "b6", text: "x" }])).toThrow(
      /use replace_block/,
    );
  });
});

describe("applyOps — structure", () => {
  it("inserts relative to a block, and into a container", () => {
    const state = makeState();
    const result = apply(state, [
      { op: "insert_blocks", after: "b1", blocks: [{ type: "paragraph", text: "new intro" }] },
      { op: "insert_blocks", appendTo: "b4.1", blocks: [{ type: "paragraph", text: "in the column" }] },
    ]);
    expect(nodeToBlock(at(result.state, 1))).toMatchObject({ text: "new intro" });
    const column = (at(result.state, 4).children as SerializedNode[])[0];
    expect((column.children as SerializedNode[]).length).toBe(2);
  });

  it("appends to the document by default", () => {
    const state = makeState();
    const result = apply(state, [
      { op: "insert_blocks", blocks: [{ type: "heading", level: 2, text: "Coda" }] },
    ]);
    const children = result.state.root.children as SerializedNode[];
    expect(children[children.length - 1]).toMatchObject({ type: "heading", tag: "h2" });
  });

  it("moves a block within its container without losing it", () => {
    const state = makeState();
    const result = apply(state, [{ op: "move_block", id: "b1", after: "b2" }]);
    const types = (result.state.root.children as SerializedNode[]).map((n) => n.type);
    expect(types.slice(0, 2)).toEqual(["paragraph", "heading"]);
  });

  it("refuses to move a container inside itself", () => {
    const state = makeState();
    expect(() => apply(state, [{ op: "move_block", id: "b4", appendTo: "b4.1" }])).toThrow(
      /cannot be moved inside itself/,
    );
  });

  it("authors nested content through a container", () => {
    const state = makeState();
    const result = apply(state, [
      {
        op: "insert_blocks",
        appendTo: "b4.2",
        blocks: [
          { type: "list", listType: "check", items: [{ text: "done", checked: true, indent: 0 }] },
        ],
      },
    ]);
    const secondColumn = (at(result.state, 3).children as SerializedNode[])[1];
    const list = (secondColumn.children as SerializedNode[])[1];
    expect(list).toMatchObject({ type: "list", listType: "check" });
    expect((list.children as SerializedNode[])[0]).toMatchObject({ checked: true });
  });

  it("reports the change count for the caller's summary line", () => {
    const state = makeState();
    const result = apply(state, [
      { op: "set_text", id: "b2", text: "a" },
      { op: "insert_blocks", after: "b2", blocks: [
        { type: "paragraph", text: "b" },
        { type: "paragraph", text: "c" },
      ] },
    ]);
    expect(result.changed).toBe(3);
  });
});

describe("applyOps — round-trip through the outline", () => {
  it("keeps the outline addressable after an edit", () => {
    const state = makeState();
    const result = apply(state, [
      { op: "insert_blocks", before: "b1", blocks: [{ type: "paragraph", text: "prelude" }] },
    ]);
    const after = outline(result.state);
    expect(after.stateHash).toBe(result.stateHash);
    // The inserted block was touched, so it carries a persistent id; the
    // heading below it was not, so it keeps its structural path — and the path
    // has shifted to b2, which is precisely the fragility ids exist to fix.
    expect(after.blocks[0].kind).toBe("paragraph");
    expect(after.blocks[0].id).toMatch(/^blk_/);
    expect(after.blocks[1]).toMatchObject({ id: "b2", kind: "heading[1]" });
  });
});
