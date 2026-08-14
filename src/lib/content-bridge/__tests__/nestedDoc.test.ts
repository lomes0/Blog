/**
 * A nested doc, through the container seam (docs/plans/haklex-reprise.md §6.1).
 *
 * `containers.test.ts` made the same claims one phase earlier over a sticky
 * note, and ended by recording the two things that made them worthless there: a
 * sticky is an inline decorator, so a load wraps it in a paragraph and its
 * blocks lose their addresses; and an op can put a node into a nested editor
 * that cannot register it, after which the *whole* nested document comes back
 * empty with nothing having failed. This file is where both are answered.
 *
 *   - The addressing survives a real load, because `nested-doc` is block-level.
 *   - The write is refused, at the bridge, before it can be stored.
 *
 * Everything else here — array identity, byte-identical surroundings, the
 * freshness guard — is `containers.test.ts`'s shape restated against the second
 * arm, because a seam with one consumer is a special case and a seam with two is
 * a seam.
 */
import { createHeadlessEditor } from "@lexical/headless";
import { editorConfig } from "@/editor/config";
import { nestedEditorConfig } from "@/editor/nodes/nestedConfig";
import { childrenOf, refusedTypesOf } from "@/lib/content-bridge/containers";
import { BLOCK_CONTAINERS, locate } from "@/lib/content-bridge/address";
import { applyOps, stateFromBlocks, type Op } from "@/lib/content-bridge/ops";
import { outline, readBlocks } from "@/lib/content-bridge/outline";
import { stateHash } from "@/lib/content-bridge/stateHash";
import type {
  SerializedNode,
  StoredState,
  WritableBlock,
} from "@/lib/content-bridge/types";
import { makeNestedDocState, snapshot } from "./fixture";

const at = (state: StoredState, index: number): SerializedNode =>
  (state.root.children as SerializedNode[])[index];

/** The nested doc, wherever a move left it. */
function aside(state: StoredState): SerializedNode {
  const find = (node: SerializedNode): SerializedNode | undefined => {
    if (node.type === "nested-doc") return node;
    for (const child of node.children ?? []) {
      const hit = find(child);
      if (hit) return hit;
    }
    return undefined;
  };
  const found = find(state.root);
  if (!found) throw new Error("no nested doc in this state");
  return found;
}

/** Its blocks, reached the long way round rather than through the seam. */
const asideChildren = (state: StoredState): SerializedNode[] =>
  ((aside(state).doc as Record<string, SerializedNode>).root
    .children) as SerializedNode[];

const textOf = (node: SerializedNode): string =>
  (node.children as SerializedNode[]).map((child) => String(child.text ?? ""))
    .join("");

const apply = (state: StoredState, ops: Op[]) =>
  applyOps(state, stateHash(state), ops);

/** A board — one of the two refused types the block IR can actually author. */
const kanban: WritableBlock = {
  type: "kanban",
  tasks: [{ name: "T", stage: 0, priority: "high" }],
};

describe("the seam reaches a nested doc's interior", () => {
  it("is in BLOCK_CONTAINERS", () => {
    expect(BLOCK_CONTAINERS.has("nested-doc")).toBe(true);
  });

  it("hands back the live array, not a copy", () => {
    // Identity, not equality — `ops.ts` splices this reference, so a mapped or
    // filtered arm would leave every read correct and every write lost.
    const state = makeNestedDocState();
    expect(childrenOf(aside(state))).toBe(asideChildren(state));
  });

  it("gives the interior ordinary one-dimensional addresses", () => {
    const entries = outline(makeNestedDocState()).blocks;
    expect(entries.map((entry) => [entry.id, entry.kind, entry.depth])).toEqual([
      ["b1", "paragraph", 0],
      ["b2", "nested-doc", 0],
      ["b2.1", "paragraph", 1],
      ["b2.2", "paragraph", 1],
      ["b3", "paragraph", 0],
    ]);
  });

  it("describes the wrapper as rewritable but not text-settable", () => {
    // Unlike a sticky, which has no codec and reads as `editable: false`: the
    // wrapper's title and open state *can* be rewritten, just not with set_text.
    expect(outline(makeNestedDocState()).blocks[1]).toMatchObject({
      preview: "open · Working notes",
      editable: true,
      textEditable: false,
    });
  });

  it("locates a nested block, and names the doc as its parent", () => {
    const state = makeNestedDocState();
    const found = locate(state, "b2.2");
    expect(found).not.toBeNull();
    expect(textOf(found!.node)).toBe("aside two");
    expect(found!.parent).toBe(aside(state));
  });

  it("reads a nested block's content", () => {
    const read = readBlocks(makeNestedDocState(), ["b2.1"]);
    expect(read.missing).toEqual([]);
    expect(read.blocks[0]).toMatchObject({
      id: "b2.1",
      type: "paragraph",
      text: "aside one",
    });
  });
});

describe("ops inside a nested doc", () => {
  const surroundings = (state: StoredState) =>
    [snapshot(at(state, 0)), snapshot(at(state, 2))] as const;

  it("inserts into it", () => {
    const state = makeNestedDocState();
    const before = surroundings(state);
    const result = apply(state, [
      {
        op: "insert_blocks",
        appendTo: "b2",
        blocks: [{ type: "paragraph", text: "aside three" }],
      },
    ]);
    expect(asideChildren(result.state).map(textOf)).toEqual([
      "aside one",
      "aside two",
      "aside three",
    ]);
    // It gained content without gaining a `children` key of its own.
    expect("children" in aside(result.state)).toBe(false);
    expect(surroundings(result.state)).toEqual(before);
  });

  it("inserts before a nested block", () => {
    const result = apply(makeNestedDocState(), [
      {
        op: "insert_blocks",
        before: "b2.2",
        blocks: [{ type: "paragraph", text: "wedged" }],
      },
    ]);
    expect(asideChildren(result.state).map(textOf)).toEqual([
      "aside one",
      "wedged",
      "aside two",
    ]);
  });

  it("replaces a nested block", () => {
    const state = makeNestedDocState();
    const before = surroundings(state);
    const result = apply(state, [
      {
        op: "replace_block",
        id: "b2.1",
        block: { type: "heading", level: 3, text: "Scratch" },
      },
    ]);
    const kids = asideChildren(result.state);
    expect(kids[0]).toMatchObject({ type: "heading", tag: "h3" });
    expect(kids.map(textOf)).toEqual(["Scratch", "aside two"]);
    expect(surroundings(result.state)).toEqual(before);
  });

  it("sets the text of a nested block", () => {
    const result = apply(makeNestedDocState(), [
      { op: "set_text", id: "b2.2", text: "rewritten" },
    ]);
    expect(asideChildren(result.state).map(textOf)).toEqual([
      "aside one",
      "rewritten",
    ]);
  });

  it("moves a block within it", () => {
    const state = makeNestedDocState();
    const before = surroundings(state);
    const result = apply(state, [
      { op: "move_block", id: "b2.1", after: "b2.2" },
    ]);
    expect(asideChildren(result.state).map(textOf)).toEqual([
      "aside two",
      "aside one",
    ]);
    expect(surroundings(result.state)).toEqual(before);
  });

  it("moves a block out of it and into the document", () => {
    const result = apply(makeNestedDocState(), [
      { op: "move_block", id: "b2.1", after: "b1" },
    ]);
    expect(asideChildren(result.state).map(textOf)).toEqual(["aside two"]);
    expect((result.state.root.children as SerializedNode[]).map((n) => n.type))
      .toEqual(["paragraph", "paragraph", "nested-doc", "paragraph"]);
    expect(textOf(at(result.state, 1))).toBe("aside one");
  });

  it("moves a block from the document into it", () => {
    const result = apply(makeNestedDocState(), [
      { op: "move_block", id: "b3", appendTo: "b2" },
    ]);
    expect((result.state.root.children as SerializedNode[]).map((n) => n.type))
      .toEqual(["paragraph", "nested-doc"]);
    expect(asideChildren(result.state).map(textOf)).toEqual([
      "aside one",
      "aside two",
      "After the aside.",
    ]);
  });

  it("deletes a nested block", () => {
    const state = makeNestedDocState();
    const before = surroundings(state);
    const result = apply(state, [{ op: "delete_block", id: "b2.1" }]);
    expect(asideChildren(result.state).map(textOf)).toEqual(["aside two"]);
    expect(JSON.stringify(result.state)).not.toContain("aside one");
    expect(surroundings(result.state)).toEqual(before);
  });

  it("retitles the wrapper without disturbing its contents", () => {
    const result = apply(makeNestedDocState(), [
      {
        op: "replace_block",
        id: "b2",
        block: { type: "nested-doc", title: "Renamed" },
      },
    ]);
    expect(aside(result.state)).toMatchObject({
      title: "Renamed",
      open: true,
    });
    // Content, not bytes: replacing a container marks its whole subtree as
    // touched, so the carried interior picks up block ids — the same thing that
    // happens when a layout is retitled and keeps its columns.
    expect(asideChildren(result.state).map(textOf)).toEqual([
      "aside one",
      "aside two",
    ]);
  });

  it("leaves it alone entirely when the edit is elsewhere", () => {
    const state = makeNestedDocState();
    const before = snapshot(aside(state));
    const result = apply(state, [
      { op: "set_text", id: "b3", text: "somewhere else entirely" },
    ]);
    expect(snapshot(aside(result.state))).toBe(before);
  });

  it("refuses to move it inside itself", () => {
    expect(() =>
      apply(makeNestedDocState(), [
        { op: "move_block", id: "b2", appendTo: "b2" },
      ])
    ).toThrow(/cannot be moved inside itself/);
  });
});

describe("the freshness guard sees inside a nested doc", () => {
  it("changes when only nested content changed", () => {
    const before = stateHash(makeNestedDocState());
    const after = apply(makeNestedDocState(), [
      { op: "set_text", id: "b2.1", text: "different" },
    ]);
    expect(after.stateHash).not.toBe(before);
    expect(after.stateHash).toBe(stateHash(after.state));
  });
});

/**
 * The hazard `containers.test.ts` measured and could not reach.
 *
 * A nested editor runs on `nestedEditorConfig`, which registers neither
 * `kanban` nor `attachment` — and the block IR can author both.
 * `parseEditorState` throws on an unregistered type, the node class swallows it
 * into `console.error`, and the nested document comes back **empty**: not "the
 * kanban was dropped", the whole interior. Phase 1 pinned that as a test while
 * a sticky was still unaddressable. `nested-doc` is block-level, so it is
 * reachable now, and every one of these must be refused before it is stored.
 */
describe("a write that would empty the nested doc is refused", () => {
  const refuse = (ops: Op[]) => () => apply(makeNestedDocState(), ops);

  it("refuses an inserted kanban", () => {
    expect(refuse([{ op: "insert_blocks", appendTo: "b2", blocks: [kanban] }]))
      .toThrow(/kanban block cannot go inside a nested-doc/);
  });

  it("refuses an inserted attachment", () => {
    expect(
      refuse([
        {
          op: "insert_blocks",
          before: "b2.1",
          blocks: [{ type: "attachment", url: "/x", filename: "x.pdf" }],
        },
      ]),
    ).toThrow(/attachment block cannot go inside a nested-doc/);
  });

  it("refuses a replace that swaps a nested block for one", () => {
    expect(refuse([{ op: "replace_block", id: "b2.1", block: kanban }]))
      .toThrow(/kanban block cannot go inside a nested-doc/);
  });

  it("refuses a refused type buried inside an otherwise legal block", () => {
    expect(
      refuse([
        {
          op: "insert_blocks",
          appendTo: "b2",
          blocks: [{ type: "details", summary: "s", body: [kanban] }],
        },
      ]),
    ).toThrow(/kanban block cannot go inside a nested-doc/);
  });

  it("refuses a move that carries one in from the document", () => {
    // The guard has to look at what is being *moved*, not only at what a codec
    // just built — so the kanban is a real block of the document first.
    const withBoard = apply(makeNestedDocState(), [
      { op: "insert_blocks", after: "b3", blocks: [kanban] },
    ]).state;
    expect(() =>
      applyOps(withBoard, stateHash(withBoard), [
        { op: "move_block", id: "b4", appendTo: "b2" },
      ])
    ).toThrow(/kanban block cannot go inside a nested-doc/);
  });

  it("refuses a landing several levels inside it, not only a direct child", () => {
    // A layout column *inside* the nested doc is not itself a nested editor, so
    // the guard has to walk the ancestor chain rather than look at the parent.
    const state = apply(makeNestedDocState(), [
      {
        op: "insert_blocks",
        appendTo: "b2",
        blocks: [
          {
            type: "layout",
            templateColumns: "1fr 1fr",
            columns: [[{ type: "paragraph", text: "l" }], [{
              type: "paragraph",
              text: "r",
            }]],
          },
        ],
      },
    ]).state;

    const columns = outline(state).blocks.filter((b) => b.kind === "layout-item");
    expect(columns).toHaveLength(2);
    expect(() =>
      applyOps(state, stateHash(state), [
        { op: "insert_blocks", appendTo: columns[0].id, blocks: [kanban] },
      ])
    ).toThrow(/kanban block cannot go inside a nested-doc/);
  });

  it("refuses one nested doc inside another", () => {
    expect(
      refuse([
        {
          op: "insert_blocks",
          appendTo: "b2",
          blocks: [
            {
              type: "nested-doc",
              title: "inner",
              body: [{ type: "paragraph", text: "x" }],
            },
          ],
        },
      ]),
    ).toThrow(/nested-doc block cannot go inside a nested-doc/);
  });

  it("refuses the whole batch — nothing is half-written", () => {
    const state = makeNestedDocState();
    const before = snapshot(state);
    expect(() =>
      applyOps(state, stateHash(state), [
        { op: "set_text", id: "b1", text: "this would have been fine" },
        { op: "insert_blocks", appendTo: "b2", blocks: [kanban] },
      ])
    ).toThrow();
    expect(snapshot(state)).toBe(before);
  });

  it("still allows those types outside a nested editor", () => {
    const result = apply(makeNestedDocState(), [
      { op: "insert_blocks", after: "b3", blocks: [kanban] },
    ]);
    expect((result.state.root.children as SerializedNode[]).at(-1)?.type)
      .toBe("kanban");
  });

  it("refuses them in a document authored whole, where no op is involved", () => {
    expect(() =>
      stateFromBlocks([
        { type: "nested-doc", title: "notes", body: [kanban] },
      ])
    ).toThrow(/kanban block cannot go inside a nested-doc/);
  });
});

/**
 * The refused set against the config it is a copy of.
 *
 * `NESTED_EDITOR_REFUSES` names what `nestedEditorConfig` does not register.
 * Written down rather than derived, because the bridge must run in a bare Node
 * process and importing node classes there would drag the editor's browser-only
 * dependencies into it (`types.ts`). So the two are compared *here* instead,
 * where importing both is fine — a node added to one and not the other is a
 * failure with a name rather than a document that silently empties.
 */
describe("the refused set matches the nested editor's node set", () => {
  const typesOf = (nodes: readonly unknown[]): Set<string> => {
    const out = new Set<string>();
    for (const entry of nodes) {
      const klass = entry as { getType?: () => string };
      if (typeof klass?.getType === "function") out.add(klass.getType());
    }
    return out;
  };

  it("is exactly what the document registers and the nested editor does not", () => {
    const document = typesOf(editorConfig.nodes);
    const nested = typesOf(nestedEditorConfig.nodes);
    const missing = [...document].filter((type) => !nested.has(type)).sort();
    expect(missing).toEqual([...refusedTypesOf("nested-doc")].sort());
    // And the sticky's arm answers with the same set — both run the same config.
    expect([...refusedTypesOf("sticky")].sort()).toEqual(missing);
  });

  it("answers with nothing for a container that is not a nested editor", () => {
    expect(refusedTypesOf("layout-item").size).toBe(0);
    expect(refusedTypesOf("root").size).toBe(0);
  });
});

/**
 * The payoff, and the one thing a sticky could not do: an agent's edit comes
 * back through a real load *with its addresses intact*.
 *
 * Built over `editorConfig.nodes` — the registry the app itself uses — because
 * `NestedDocNode.importJSON` is reached through registration rather than called
 * directly, and because it swallows a parse failure the way `StickyNode` does.
 * "Did not throw" therefore proves nothing here; the content and the silence
 * are both asserted.
 */
describe("an edited nested doc survives a load", () => {
  const roundTrip = (state: StoredState): StoredState => {
    const editor = createHeadlessEditor({
      namespace: editorConfig.namespace,
      nodes: editorConfig.nodes,
      onError: (error) => {
        throw error;
      },
    });
    editor.setEditorState(editor.parseEditorState(JSON.stringify(state)));
    return editor.getEditorState().toJSON() as unknown as StoredState;
  };

  const edited = () =>
    apply(makeNestedDocState(), [
      { op: "delete_block", id: "b2.1" },
      {
        op: "replace_block",
        id: "b2.2",
        block: { type: "heading", level: 4, text: "Kept" },
      },
      {
        op: "insert_blocks",
        appendTo: "b2",
        blocks: [{ type: "paragraph", text: "added by an agent" }],
      },
    ]).state;

  it("carries the insert, the replace and the delete through importJSON", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let loaded: StoredState;
    try {
      loaded = roundTrip(edited());
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }

    expect(asideChildren(loaded).map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
    ]);
    expect(asideChildren(loaded).map(textOf)).toEqual([
      "Kept",
      "added by an agent",
    ]);
    expect(JSON.stringify(loaded)).not.toContain("aside one");
  });

  it("keeps the addresses, which is what a sticky loses here", () => {
    const loaded = roundTrip(edited());
    // The interior is still one level down and still addressed. The equivalent
    // sticky assertion reads `["paragraph", "paragraph", "paragraph"]` and
    // `missing: ["b2.1"]`, because the load wrapped the note.
    expect(outline(loaded).blocks.map((entry) => [entry.depth, entry.kind]))
      .toEqual([
        [0, "paragraph"],
        [0, "nested-doc"],
        [1, "heading[4]"],
        [1, "paragraph"],
        [0, "paragraph"],
      ]);
    const read = readBlocks(loaded, ["b2.1", "b2.2"]);
    expect(read.missing).toEqual([]);
    expect(read.blocks[0]).toMatchObject({ type: "heading", text: "Kept" });
    expect(read.blocks[1]).toMatchObject({
      type: "paragraph",
      text: "added by an agent",
    });
  });

  it("keeps the wrapper's own fields, and the blocks around it", () => {
    const loaded = roundTrip(edited());
    expect(aside(loaded)).toMatchObject({
      title: "Working notes",
      open: true,
    });
    expect([textOf(at(loaded, 0)), textOf(at(loaded, 2))]).toEqual([
      "Before the aside.",
      "After the aside.",
    ]);
  });

  it("stamps the blocks it touched, through the nested editor's own load", () => {
    const loaded = roundTrip(edited());
    const stamped = asideChildren(loaded).map((node) =>
      String((node.$ as Record<string, unknown>)?.blockId)
    );
    expect(stamped.every((id) => id.startsWith("blk_"))).toBe(true);
  });
});

describe("the fixture's own shape", () => {
  it("keeps its interior where the node class writes it", () => {
    // A guard on the fixture rather than on the code: everything above would
    // still pass if the fixture and the arm agreed on a path the node class
    // does not use, and the whole file would be testing itself.
    const node = aside(makeNestedDocState());
    expect(Object.keys(node.doc as object)).toEqual(["root"]);
    expect(childrenOf(node).map(textOf)).toEqual(["aside one", "aside two"]);
  });
});
