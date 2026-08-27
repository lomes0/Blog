/**
 * A canvas, addressed through to its notes' blocks —
 * docs/plans/nested-editor-support.md §4.
 *
 * This is the seam `containers.test.ts` describes, one level deeper and with
 * one difference that is the whole reason the phase was hard: **a note has no
 * `type` of its own.** `CanvasNode.exportJSON` writes its notes as frames —
 * `{ id, x, y, color, editor }` — so every switch on `node.type` in the bridge
 * sees `undefined` for one, and `typeOf` is what gives it `canvas-note`.
 *
 * The same two things are asserted harder than the rest as in the sticky's
 * spec, for the same reasons: **array identity**, because `ops.ts` splices what
 * `childrenOf` hands it, and **loadability**, because `CanvasNode.importJSON`
 * swallows a parse failure and hands back an empty note rather than throwing.
 */
import { createHeadlessEditor } from "@lexical/headless";
import { editorConfig } from "@/editor/config";
import {
  CANVAS_NOTE_TYPE,
  childrenOf,
  ensureChildrenOf,
  typeOf,
} from "@/lib/content-bridge/containers";
import { locate } from "@/lib/content-bridge/address";
import { applyOps, type Op } from "@/lib/content-bridge/ops";
import { outline, readBlocks } from "@/lib/content-bridge/outline";
import { stateHash } from "@/lib/content-bridge/stateHash";
import type { SerializedNode, StoredState } from "@/lib/content-bridge/types";
import { makeCanvasState, paragraph, snapshot } from "./fixture";

const board = (state: StoredState): SerializedNode =>
  (state.root.children as SerializedNode[])[1];

const notes = (state: StoredState): SerializedNode[] =>
  board(state).notes as unknown as SerializedNode[];

/** A note's blocks, reached the long way round rather than through the seam. */
const noteChildren = (state: StoredState, index: number): SerializedNode[] =>
  ((notes(state)[index].editor as Record<string, Record<string, SerializedNode>>)
    .editorState.root.children) as SerializedNode[];

const textOf = (node: SerializedNode): string =>
  (node.children as SerializedNode[]).map((child) => String(child.text ?? ""))
    .join("");

const apply = (state: StoredState, ops: Op[]) =>
  applyOps(state, stateHash(state), ops);

describe("the seam", () => {
  it("gives a frame a type it does not store", () => {
    const state = makeCanvasState();
    expect(typeOf(notes(state)[0])).toBe(CANVAS_NOTE_TYPE);
    // And does not take one away from anything that has one. A sticky holds
    // the same `editor` key and must keep answering "sticky".
    expect(typeOf(board(state))).toBe("canvas");
  });

  it("reads a board's notes as its children — the live array", () => {
    const state = makeCanvasState();
    expect(childrenOf(board(state))).toBe(board(state).notes);
  });

  it("reads a note's blocks through its nested editor — the live array", () => {
    const state = makeCanvasState();
    expect(childrenOf(notes(state)[0])).toBe(noteChildren(state, 0));
  });

  it("mints a note's editor state when it is half there", () => {
    // A frame whose `editor` exists but holds nothing — which is what an empty
    // note serializes to before anything is typed in it.
    const bare = { id: "n3", x: 0, y: 0, editor: {} } as unknown as SerializedNode;
    const children = ensureChildrenOf(bare);
    children.push(paragraph("first"));
    expect(
      ((bare.editor as Record<string, Record<string, SerializedNode>>)
        .editorState.root.children as unknown as SerializedNode[]),
    ).toBe(children);
  });

  it("mints a board's notes array when it has none", () => {
    const bare = { type: "canvas", version: 1 } as SerializedNode;
    expect(ensureChildrenOf(bare)).toBe(bare.notes);
  });
});

describe("addressing", () => {
  it("descends board -> note -> block", () => {
    const entries = outline(makeCanvasState()).blocks;
    expect(entries.map((entry) => [entry.id, entry.kind])).toEqual([
      ["b1", "paragraph"],
      ["b2", "canvas"],
      ["b2.1", CANVAS_NOTE_TYPE],
      ["b2.1.1", "paragraph"],
      ["b2.1.2", "paragraph"],
      ["b2.2", CANVAS_NOTE_TYPE],
      ["b2.2.1", "paragraph"],
      ["b3", "paragraph"],
    ]);
  });

  it("describes a note by its colour and weight", () => {
    const entries = outline(makeCanvasState()).blocks;
    expect(entries[2].preview).toBe("yellow note · 2 blocks");
    expect(entries[5].preview).toBe("mint note · 1 block");
  });

  it("reads a block inside a note", () => {
    const read = readBlocks(makeCanvasState(), ["b2.2.1"]);
    expect(read.missing).toEqual([]);
    expect(read.blocks[0]).toMatchObject({
      type: "paragraph",
      text: "second board note",
    });
  });

  it("locates a note itself", () => {
    const state = makeCanvasState();
    const found = locate(state, "b2.1");
    expect(found?.node).toBe(notes(state)[0]);
    expect(found?.parent).toBe(board(state));
  });
});

/**
 * Every op below asserts two things: that the *stored* JSON moved at
 * `notes[i].editor.editorState.root.children`, and that the blocks either side
 * of the board came out byte-identical — the §4.1 claim restated two levels
 * down.
 */
describe("ops inside a note", () => {
  const surroundings = (state: StoredState) =>
    [
      snapshot((state.root.children as SerializedNode[])[0]),
      snapshot((state.root.children as SerializedNode[])[2]),
    ] as const;

  it("inserts into a note", () => {
    const state = makeCanvasState();
    const before = surroundings(state);
    const result = apply(state, [
      { op: "insert_blocks", after: "b2.1.1", blocks: [{ type: "paragraph", text: "wedged" }] },
    ]);

    expect(noteChildren(result.state, 0).map(textOf)).toEqual([
      "note one",
      "wedged",
      "note two",
    ]);
    expect(surroundings(result.state)).toEqual(before);
  });

  it("rewrites a block inside a note", () => {
    const state = makeCanvasState();
    const result = apply(state, [
      { op: "set_text", id: "b2.2.1", text: "edited in place" },
    ]);

    expect(noteChildren(result.state, 1).map(textOf)).toEqual([
      "edited in place",
    ]);
    // The other note is untouched, which is what makes a note a document
    // rather than a view of the board.
    expect(noteChildren(result.state, 0).map(textOf)).toEqual([
      "note one",
      "note two",
    ]);
  });

  it("deletes a block inside a note", () => {
    const state = makeCanvasState();
    const result = apply(state, [{ op: "delete_block", id: "b2.1.1" }]);

    expect(noteChildren(result.state, 0).map(textOf)).toEqual(["note two"]);
  });

  it("moves a whole note on the board", () => {
    const state = makeCanvasState();
    const result = apply(state, [{ op: "move_block", id: "b2.1", after: "b2.2" }]);

    expect(notes(result.state).map((note) => note.id)).toEqual(["n2", "n1"]);
    // The frame's geometry travels with it — a move reorders the array, it does
    // not move the note on the board.
    expect(notes(result.state)[1]).toMatchObject({ x: 20, y: 20, color: "yellow" });
  });
});

describe("a mutated board survives a load", () => {
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

  it("carries an agent's edit through importJSON", () => {
    const edited = apply(makeCanvasState(), [
      { op: "set_text", id: "b2.1.1", text: "edited by an agent" },
      {
        op: "insert_blocks",
        after: "b2.2.1",
        blocks: [{ type: "heading", level: 3, text: "Added" }],
      },
    ]);
    // `CanvasNode.importJSON` swallows a parse failure into `console.error` and
    // hands back an empty note, so silence is half the assertion.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let loaded: StoredState;
    try {
      loaded = roundTrip(edited.state);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }

    expect(noteChildren(loaded, 0).map(textOf)).toEqual([
      "edited by an agent",
      "note two",
    ]);
    expect(noteChildren(loaded, 1).map((node) => node.type)).toEqual([
      "paragraph",
      "heading",
    ]);
  });

  it("keeps the board a root child, so its notes stay addressable", () => {
    // The acceptance test for §3: `CanvasNode.isInline()` returns false, so the
    // load no longer wraps the board in a paragraph and takes every address
    // below it off the map.
    const loaded = roundTrip(makeCanvasState());
    expect((loaded.root.children as SerializedNode[]).map((n) => n.type))
      .toEqual(["paragraph", "canvas", "paragraph"]);
    expect(readBlocks(loaded, ["b2.1.1"]).missing).toEqual([]);
  });

  it("keeps each frame's own fields", () => {
    const loaded = roundTrip(makeCanvasState());
    expect(notes(loaded)[1]).toMatchObject({
      id: "n2",
      x: 300,
      y: 20,
      width: 240,
      height: 200,
      color: "mint",
    });
    expect(board(loaded)).toMatchObject({ id: "board-1", height: 480 });
  });
});
