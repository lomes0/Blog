/**
 * The container-children seam (docs/plans/haklex-reprise.md §3).
 *
 * A sticky note is a document stored inside a block: its content is a whole
 * nested editor at `editor.editorState.root.children`, not at `children`. Phase
 * 1's claim is that this costs **no new addressing concept** — the note's blocks
 * are `b2.1` and `b2.2` exactly as a layout column's are (§3.2) — and that ops
 * reach them without any other module learning where they live.
 *
 * Two things are asserted harder than the rest, because they are the ways the
 * seam fails without anything going red:
 *
 *   - **Array identity.** `ops.ts` splices what `childrenOf` hands it, so an arm
 *     that returns a copy leaves every read correct and every write landing on
 *     a discarded array. `toBe`, never `toEqual` (§10, second bullet).
 *   - **Loadability.** An op that splices a nested `children` array cannot
 *     produce JSON the editor refuses — and `StickyNode.importJSON` *swallows* a
 *     parse failure, so a broken note comes back empty rather than throwing.
 *     The round-trip below therefore builds a real editor over the real registry
 *     (the §10.3 rule) and asserts the content survived, not merely that nothing
 *     threw.
 */
import { createHeadlessEditor } from "@lexical/headless";
import { editorConfig } from "@/editor/config";
import {
  childrenOf,
  ensureChildrenOf,
  typeOf,
} from "@/lib/content-bridge/containers";
import { locate } from "@/lib/content-bridge/address";
import { applyOps, type Op } from "@/lib/content-bridge/ops";
import { outline, readBlocks } from "@/lib/content-bridge/outline";
import { stateHash } from "@/lib/content-bridge/stateHash";
import type { SerializedNode, StoredState } from "@/lib/content-bridge/types";
import { makeStickyState, paragraph, snapshot } from "./fixture";

const at = (state: StoredState, index: number): SerializedNode =>
  (state.root.children as SerializedNode[])[index];

/**
 * The sticky note, wherever it ended up.
 *
 * Searched for rather than indexed, because a move shifts it and a load *wraps*
 * it — see the round-trip block at the foot of this file.
 */
function note(state: StoredState): SerializedNode {
  const find = (node: SerializedNode): SerializedNode | undefined => {
    if (node.type === "sticky") return node;
    for (const child of node.children ?? []) {
      const hit = find(child);
      if (hit) return hit;
    }
    return undefined;
  };
  const found = find(state.root);
  if (!found) throw new Error("no sticky note in this state");
  return found;
}

/** The note's blocks, reached the long way round rather than through the seam. */
const noteChildren = (state: StoredState): SerializedNode[] =>
  ((note(state).editor as Record<string, Record<string, SerializedNode>>)
    .editorState.root.children) as SerializedNode[];

const textOf = (node: SerializedNode): string =>
  (node.children as SerializedNode[]).map((child) => String(child.text ?? ""))
    .join("");

const apply = (state: StoredState, ops: Op[]) =>
  applyOps(state, stateHash(state), ops);

describe("childrenOf hands back the live array", () => {
  it("is the same object for an ordinary container", () => {
    const state = makeStickyState();
    expect(childrenOf(state.root)).toBe(state.root.children);
  });

  it("is the same object through a nested editor", () => {
    const state = makeStickyState();
    // Identity, not equality. A splice through this reference has to be visible
    // in the stored JSON, which is the whole of what `delete_block` and
    // `move_block` rely on.
    expect(childrenOf(note(state))).toBe(noteChildren(state));
  });

  it("does not give a leaf a children array in passing", () => {
    const kanban: SerializedNode = { type: "kanban", version: 1, tasks: [] };
    const before = snapshot(kanban);
    expect(childrenOf(kanban)).toEqual([]);
    expect("children" in kanban).toBe(false);
    expect(snapshot(kanban)).toBe(before);
  });

  it("does not mint the nested path on a note that has none", () => {
    const bare: SerializedNode = { type: "sticky", version: 1, style: "" };
    const before = snapshot(bare);
    expect(childrenOf(bare)).toEqual([]);
    expect(snapshot(bare)).toBe(before);
  });
});

describe("ensureChildrenOf creates only where something is being appended", () => {
  it("creates the array on an ordinary node and returns the live one", () => {
    const node: SerializedNode = { type: "layout-item", version: 1 };
    const children = ensureChildrenOf(node);
    children.push(paragraph("first"));
    expect(node.children).toBe(children);
    expect((node.children as SerializedNode[]).length).toBe(1);
  });

  it("mints every missing object on the nested path", () => {
    const bare: SerializedNode = { type: "sticky", version: 1, style: "" };
    ensureChildrenOf(bare).push(paragraph("appended"));
    expect(childrenOf(bare)).toHaveLength(1);
    expect(textOf(childrenOf(bare)[0])).toBe("appended");
    // …and at the place the node class actually reads from, not merely
    // somewhere `childrenOf` agrees with itself about.
    const editor = bare.editor as Record<string, Record<string, SerializedNode>>;
    expect(editor.editorState.root.children).toHaveLength(1);
    // The note itself still has no `children` key of its own.
    expect("children" in bare).toBe(false);
  });

  it("returns the existing nested array rather than replacing it", () => {
    const state = makeStickyState();
    const before = noteChildren(state);
    expect(ensureChildrenOf(note(state))).toBe(before);
    expect(before).toHaveLength(2);
  });
});

describe("typeOf", () => {
  it("is the node's own type, with or without a parent", () => {
    const state = makeStickyState();
    expect(typeOf(note(state))).toBe("sticky");
    expect(typeOf(noteChildren(state)[0])).toBe("paragraph");
  });
});

describe("addressing reaches inside a sticky note", () => {
  it("gives the note's blocks ordinary one-dimensional addresses", () => {
    const entries = outline(makeStickyState()).blocks;
    expect(entries.map((entry) => [entry.id, entry.kind, entry.depth])).toEqual([
      ["b1", "paragraph", 0],
      ["b2", "sticky", 0],
      ["b2.1", "paragraph", 1],
      ["b2.2", "paragraph", 1],
      ["b3", "paragraph", 0],
    ]);
  });

  it("keeps the note itself opaque while its contents are readable", () => {
    const entries = outline(makeStickyState()).blocks;
    expect(entries[1]).toMatchObject({
      preview: "sticky note",
      editable: false,
    });
    expect(entries[2]).toMatchObject({ preview: "note one", editable: true });
  });

  it("locates a nested block, and names the note as its parent", () => {
    const state = makeStickyState();
    const found = locate(state, "b2.2");
    expect(found).not.toBeNull();
    expect(textOf(found!.node)).toBe("note two");
    expect(found!.parent).toBe(note(state));
    expect(found!.index).toBe(1);
  });

  it("reads a nested block's content", () => {
    const read = readBlocks(makeStickyState(), ["b2.1"]);
    expect(read.missing).toEqual([]);
    expect(read.blocks[0]).toMatchObject({
      id: "b2.1",
      type: "paragraph",
      text: "note one",
    });
  });

  /**
   * The limit of what this seam can do, pinned rather than discovered later.
   *
   * `StickyNode` is an inline decorator and `StickyPlugin` wraps a root-level
   * one in a paragraph on insert (`StickyPlugin/index.ts:58`), so a note the app
   * produced sits *inside* a paragraph. `paragraph` is not a container and must
   * not become one — §2.4's reason for images holds verbatim here: it carries
   * text, and descending into it would give two addresses for one piece of
   * content. So a wrapped note is unreachable by address no matter what the
   * container seam does, and the paragraph around it reads as text-opaque.
   */
  it("does not reach a note wrapped in a paragraph — the §2.4 limit", () => {
    const wrapped = makeStickyState();
    const children = wrapped.root.children as SerializedNode[];
    children[1] = {
      type: "paragraph",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [children[1]],
    };

    const entries = outline(wrapped).blocks;
    expect(entries.map((entry) => entry.id)).toEqual(["b1", "b2", "b3"]);
    expect(entries[1]).toMatchObject({
      kind: "paragraph",
      preview: "[sticky note]",
      textEditable: false,
    });
  });
});

/**
 * Every op below asserts two things: that the *stored* JSON moved at
 * `editor.editorState.root.children`, and that the blocks either side of the
 * note came out byte-identical — the §4.1 claim `ops.test.ts` makes at top
 * level, restated one level down.
 */
describe("ops inside a sticky note", () => {
  const surroundings = (state: StoredState) =>
    [snapshot(at(state, 0)), snapshot(at(state, 2))] as const;

  it("inserts into the note", () => {
    const state = makeStickyState();
    const before = surroundings(state);
    const result = apply(state, [
      {
        op: "insert_blocks",
        appendTo: "b2",
        blocks: [{ type: "paragraph", text: "note three" }],
      },
    ]);
    expect(noteChildren(result.state).map(textOf)).toEqual([
      "note one",
      "note two",
      "note three",
    ]);
    // The note gained content without gaining a `children` key.
    expect("children" in note(result.state)).toBe(false);
    expect(surroundings(result.state)).toEqual(before);
  });

  it("inserts before a nested block", () => {
    const state = makeStickyState();
    const result = apply(state, [
      {
        op: "insert_blocks",
        before: "b2.2",
        blocks: [{ type: "paragraph", text: "wedged" }],
      },
    ]);
    expect(noteChildren(result.state).map(textOf)).toEqual([
      "note one",
      "wedged",
      "note two",
    ]);
  });

  it("replaces a nested block", () => {
    const state = makeStickyState();
    const before = surroundings(state);
    const result = apply(state, [
      {
        op: "replace_block",
        id: "b2.1",
        block: { type: "heading", level: 3, text: "Reminder" },
      },
    ]);
    const kids = noteChildren(result.state);
    expect(kids[0]).toMatchObject({ type: "heading", tag: "h3" });
    expect(textOf(kids[0])).toBe("Reminder");
    expect(textOf(kids[1])).toBe("note two");
    expect(surroundings(result.state)).toEqual(before);
  });

  it("sets the text of a nested block", () => {
    const state = makeStickyState();
    const result = apply(state, [
      { op: "set_text", id: "b2.2", text: "rewritten" },
    ]);
    expect(noteChildren(result.state).map(textOf)).toEqual([
      "note one",
      "rewritten",
    ]);
  });

  it("moves a block within the note", () => {
    const state = makeStickyState();
    const before = surroundings(state);
    const result = apply(state, [
      { op: "move_block", id: "b2.1", after: "b2.2" },
    ]);
    expect(noteChildren(result.state).map(textOf)).toEqual([
      "note two",
      "note one",
    ]);
    expect(surroundings(result.state)).toEqual(before);
  });

  it("moves a block out of the note and into the document", () => {
    const state = makeStickyState();
    const result = apply(state, [
      { op: "move_block", id: "b2.1", after: "b1" },
    ]);
    // The splice has to have hit the *stored* nested array, not a copy of it.
    expect(noteChildren(result.state).map(textOf)).toEqual(["note two"]);
    expect((result.state.root.children as SerializedNode[]).map((n) => n.type))
      .toEqual(["paragraph", "paragraph", "sticky", "paragraph"]);
    expect(textOf(at(result.state, 1))).toBe("note one");
  });

  it("moves a block from the document into the note", () => {
    const state = makeStickyState();
    const result = apply(state, [
      { op: "move_block", id: "b3", appendTo: "b2" },
    ]);
    expect((result.state.root.children as SerializedNode[]).map((n) => n.type))
      .toEqual(["paragraph", "sticky"]);
    expect(noteChildren(result.state).map(textOf)).toEqual([
      "note one",
      "note two",
      "After the note.",
    ]);
  });

  it("deletes a nested block", () => {
    const state = makeStickyState();
    const before = surroundings(state);
    const result = apply(state, [{ op: "delete_block", id: "b2.1" }]);
    expect(noteChildren(result.state).map(textOf)).toEqual(["note two"]);
    expect(JSON.stringify(result.state)).not.toContain("note one");
    expect(surroundings(result.state)).toEqual(before);
  });

  it("leaves the note itself alone when the edit is elsewhere", () => {
    const state = makeStickyState();
    const before = snapshot(note(state));
    const result = apply(state, [
      { op: "set_text", id: "b3", text: "somewhere else entirely" },
    ]);
    expect(snapshot(note(result.state))).toBe(before);
  });

  it("refuses to move the note inside itself", () => {
    const state = makeStickyState();
    expect(() => apply(state, [{ op: "move_block", id: "b2", appendTo: "b2" }]))
      .toThrow(/cannot be moved inside itself/);
  });
});

/**
 * §3.2: the freshness guard has to move when nested content moves.
 *
 * It already does — `stateHash` canonicalizes the whole JSON — but that is the
 * kind of property that degrades silently, and a guard that stops noticing is
 * how a stale write gets promoted. So it is pinned rather than assumed.
 */
describe("the freshness guard sees inside a note", () => {
  it("changes when only nested content changed", () => {
    const before = stateHash(makeStickyState());
    const after = apply(makeStickyState(), [
      { op: "set_text", id: "b2.1", text: "different" },
    ]);
    expect(after.stateHash).not.toBe(before);
    expect(after.stateHash).toBe(stateHash(after.state));
  });

  it("refuses a batch addressed against the pre-edit note", () => {
    const stale = stateHash(makeStickyState());
    const edited = apply(makeStickyState(), [
      { op: "delete_block", id: "b2.1" },
    ]);
    expect(() =>
      applyOps(edited.state, stale, [
        { op: "set_text", id: "b2.1", text: "too late" },
      ])
    ).toThrow(/changed since it was read/);
  });
});

/**
 * A note an agent edited still parses (§3.2, third bullet).
 *
 * Built through a live editor over `editorConfig.nodes` — the registry the app
 * itself uses — because `StickyNode.importJSON` is the only path that parses
 * `editor.editorState`, and it is reached through node registration rather than
 * called directly. §10.3's rule: a node test that never builds an editor is not
 * testing registration.
 *
 * It also swallows a parse failure into `console.error` and returns an empty
 * note, so "did not throw" proves nothing here. Both the content and the
 * silence are asserted.
 */
describe("a mutated note survives a load", () => {
  const roundTrip = (state: StoredState) => {
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

  it("carries an inserted, replaced and deleted note block through importJSON", () => {
    const edited = apply(makeStickyState(), [
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
    ]);

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let loaded: StoredState;
    try {
      loaded = roundTrip(edited.state);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }

    const kids = noteChildren(loaded);
    expect(kids.map((node) => node.type)).toEqual(["heading", "paragraph"]);
    expect(kids.map(textOf)).toEqual(["Kept", "added by an agent"]);
    expect(JSON.stringify(loaded)).not.toContain("note one");
  });

  it("keeps the note's own fields, and the blocks around it", () => {
    const state = makeStickyState();
    const edited = apply(state, [
      { op: "set_text", id: "b2.1", text: "edited in place" },
    ]);
    const loaded = roundTrip(edited.state);

    expect(note(loaded).style).toBe(note(state).style);
    expect(textOf(at(loaded, 0))).toBe("Before the note.");
    expect(textOf(at(loaded, 2))).toBe("After the note.");
    expect(noteChildren(loaded).map(textOf)).toEqual([
      "edited in place",
      "note two",
    ]);
    // The write stamped the block it touched, and the stamp came back through
    // the nested editor's own load exactly as it does at top level.
    expect(String((noteChildren(loaded)[0].$ as Record<string, unknown>)
      ?.blockId)).toMatch(/^blk_/);
  });

  /**
   * The hazard this file measured in phase 1, now guarded — and still measured.
   *
   * A nested editor runs on `nestedEditorConfig`, which deliberately excludes
   * StickyNode, CanvasNode, KanbanNode, AttachmentNode, PageBreakNode and
   * NestedDocNode. The block IR can author two of those, and until phase 4
   * nothing between an `insert_blocks` and the nested editor's
   * `parseEditorState` looked. The parse throws, `StickyNode.importJSON`
   * **swallows it into `console.error`** and returns a note with its default
   * empty state — so the whole note's content is gone, on load, with the write
   * itself having reported success.
   *
   * Phase 4 refuses the write instead (`findUnregisterable` in
   * `containers.ts`). Both halves stay asserted: that the op is now refused, and
   * — by pushing the same node in behind the guard's back — that the loss it
   * prevents is real rather than a story about one.
   */
  it("refuses an op that would insert a node the note's editor cannot register", () => {
    expect(() =>
      apply(makeStickyState(), [
        {
          op: "insert_blocks",
          appendTo: "b2",
          blocks: [
            {
              type: "kanban",
              tasks: [{ name: "T", stage: 0, priority: "high" }],
            },
          ],
        },
      ])
    ).toThrow(/kanban block cannot go inside a sticky/);
  });

  it("would silently empty the note if that refusal were removed", () => {
    // Written straight into the stored JSON, which is what the guard stands
    // between an agent and. Nothing here goes through `applyOps`.
    const state = makeStickyState();
    noteChildren(state).push({ type: "kanban", version: 1, tasks: [] });

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let loaded: StoredState;
    let logged: number;
    try {
      loaded = roundTrip(state);
      // Read before restoring: `mockRestore` clears the recorded calls too.
      logged = errors.mock.calls.length;
    } finally {
      errors.mockRestore();
    }

    // Logged, not thrown — which is the whole of "silently".
    expect(logged).toBeGreaterThan(0);
    // Not "the kanban was dropped" — the note comes back with nothing in it.
    expect(noteChildren(loaded)).toHaveLength(0);
    expect(JSON.stringify(loaded)).not.toContain("note one");
    expect(JSON.stringify(loaded)).not.toContain("kanban");
  });

  /**
   * The load leaves the note a root child, so its blocks keep their addresses.
   *
   * **This test used to assert the opposite**, and it was right to: an inline
   * decorator cannot be a root child, so Lexical wrapped it in a paragraph and
   * `b2.1` stopped naming anything. That was the inline-decorator wall, and the
   * seam below it reached a note only in states nothing could produce.
   * `StickyNode.isInline()` returns false now
   * (docs/plans/nested-editor-support.md §3), which is the whole of what the
   * seam was waiting for — so this is the acceptance test for that phase, kept
   * where the limit it replaces was recorded.
   */
  it("keeps the note a root child, so its blocks stay addressable", () => {
    const loaded = roundTrip(
      apply(makeStickyState(), [
        { op: "set_text", id: "b2.1", text: "edited in place" },
      ]).state,
    );
    expect((loaded.root.children as SerializedNode[]).map((n) => n.type))
      .toEqual(["paragraph", "sticky", "paragraph"]);

    const entries = outline(loaded).blocks;
    expect(entries.map((entry) => entry.kind)).toEqual([
      "paragraph",
      "sticky",
      "paragraph",
      "paragraph",
      "paragraph",
    ]);
    expect(readBlocks(loaded, ["b2.1"]).missing).toEqual([]);
  });
});
