import { createHeadlessEditor } from "@lexical/headless";
import {
  $createNodeSelection,
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $setSelection,
  $setState,
  type LexicalEditor,
  type ParagraphNode,
  type TextNode,
} from "lexical";
import {
  $createListItemNode,
  $createListNode,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import {
  $createLayoutContainerNode,
  $createLayoutItemNode,
  LayoutContainerNode,
  LayoutItemNode,
} from "@/editor/nodes/LayoutNode";
import { blockIdState } from "@/lib/content-bridge";
import { $captureSelection, captureSelection } from "../captureSelection";

/**
 * Selection context for the model (docs/plans/haklex-adoption.md §7.3).
 *
 * These drive a real headless editor rather than hand-building a selection
 * object: the whole question is whether an anchor Lexical actually produced
 * lands on the address the agent tools accept, and a fake `RangeSelection`
 * would answer a different question. Headless is enough — a selection lives in
 * the editor state, not in the DOM, so `$setSelection` in an update is exactly
 * what a real click leaves behind.
 *
 * The load-bearing case is the *unstamped* one. Our block ids are
 * opportunistic, so most blocks in most documents have none, and a capture that
 * only knew how to read an id would hand the model an empty anchor on the
 * common path.
 */

const makeEditor = () =>
  createHeadlessEditor({
    namespace: "capture-selection-test",
    nodes: [ListNode, ListItemNode, LayoutContainerNode, LayoutItemNode],
    onError: (error) => {
      throw error;
    },
  });

/** One paragraph per string, in order. `null` leaves that paragraph unstamped. */
function seed(
  editor: LexicalEditor,
  paragraphs: { text: string | string[]; id?: string }[],
): { blocks: ParagraphNode[]; texts: TextNode[][] } {
  const blocks: ParagraphNode[] = [];
  const texts: TextNode[][] = [];
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    for (const spec of paragraphs) {
      const paragraph = $createParagraphNode();
      // Alternating bold: adjacent text nodes with the same format are merged
      // by Lexical's normalization, which would invalidate the very keys these
      // specs then select between.
      const runs = (Array.isArray(spec.text) ? spec.text : [spec.text]).map(
        (run, index) => {
          const node = $createTextNode(run);
          if (index % 2 === 1) node.toggleFormat("bold");
          return node;
        },
      );
      runs.forEach((run) => paragraph.append(run));
      root.append(paragraph);
      if (spec.id) $setState(paragraph, blockIdState, spec.id);
      blocks.push(paragraph);
      texts.push(runs);
    }
  }, { discrete: true });
  return { blocks, texts };
}

/** Put a range between two text nodes and capture what the agent would see. */
function selectText(
  editor: LexicalEditor,
  from: { node: TextNode; offset: number },
  to: { node: TextNode; offset: number },
) {
  editor.update(() => {
    const selection = $createRangeSelection();
    selection.anchor.set(from.node.getKey(), from.offset, "text");
    selection.focus.set(to.node.getKey(), to.offset, "text");
    $setSelection(selection);
  }, { discrete: true });
  return captureSelection(editor);
}

describe("$captureSelection", () => {
  it("names a stamped paragraph by its persistent id", () => {
    const editor = makeEditor();
    const { texts } = seed(editor, [
      { text: "first paragraph" },
      { text: "the second one", id: "blk_second" },
    ]);

    const captured = selectText(
      editor,
      { node: texts[1][0], offset: 4 },
      { node: texts[1][0], offset: 10 },
    );

    expect(captured).toEqual({
      kind: "text",
      text: "second",
      anchor: { id: "blk_second", offset: 4 },
      focus: { id: "blk_second", offset: 10 },
      ids: ["blk_second"],
    });
  });

  it("falls back to the structural address when the block is unstamped", () => {
    const editor = makeEditor();
    const { texts } = seed(editor, [
      { text: "first paragraph" },
      { text: "the second one" },
    ]);

    const captured = selectText(
      editor,
      { node: texts[1][0], offset: 0 },
      { node: texts[1][0], offset: 3 },
    );

    // Second root child, 1-based — the same address `walkBlocks` would mint.
    expect(captured).toMatchObject({
      anchor: { id: "b2", offset: 0 },
      focus: { id: "b2", offset: 3 },
      ids: ["b2"],
    });
  });

  it("counts offsets across the formatting runs inside a block", () => {
    const editor = makeEditor();
    // Three text nodes, as a paragraph with a bold word in the middle has.
    const { texts } = seed(editor, [{ text: ["alpha ", "beta", " gamma"] }]);

    const captured = selectText(
      editor,
      { node: texts[0][1], offset: 1 },
      { node: texts[0][2], offset: 3 },
    );

    expect(captured).toMatchObject({
      text: "eta ga",
      // "alpha " is 6 characters, so offset 1 of the second run is 7.
      anchor: { id: "b1", offset: 7 },
      focus: { id: "b1", offset: 13 },
    });
  });

  it("lists every block a cross-block range touches, in document order", () => {
    const editor = makeEditor();
    const { texts } = seed(editor, [
      { text: "one" },
      { text: "two", id: "blk_two" },
      { text: "three" },
      { text: "four" },
    ]);

    const captured = selectText(
      editor,
      { node: texts[1][0], offset: 1 },
      { node: texts[3][0], offset: 2 },
    );

    expect(captured).toMatchObject({
      kind: "text",
      anchor: { id: "blk_two", offset: 1 },
      focus: { id: "b4", offset: 2 },
      // Mixed spellings in one span is the point: ids and paths coexist.
      ids: ["blk_two", "b3", "b4"],
    });
    // `text` is Lexical's own `RangeSelection.getTextContent()`, which joins
    // blocks with a single newline. The *offsets* are into each block's own
    // `getTextContent()`, which is a different string — see the list spec.
    expect((captured as { text: string }).text).toBe("wo\nthree\nfo");
  });

  it("captures a backwards range with anchor and focus as the user made them", () => {
    const editor = makeEditor();
    const { texts } = seed(editor, [{ text: "one" }, { text: "two" }]);

    const captured = selectText(
      editor,
      { node: texts[1][0], offset: 2 },
      { node: texts[0][0], offset: 1 },
    );

    expect(captured).toMatchObject({
      anchor: { id: "b2", offset: 2 },
      focus: { id: "b1", offset: 1 },
      ids: ["b1", "b2"],
    });
  });

  it("counts the blank line between the items of a list block", () => {
    const editor = makeEditor();
    let second: TextNode | null = null;
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      const list = $createListNode("bullet");
      for (const label of ["alpha", "beta"]) {
        const item = $createListItemNode();
        const text = $createTextNode(label);
        item.append(text);
        list.append(item);
        if (label === "beta") second = text;
      }
      root.append(list);
    }, { discrete: true });

    const captured = selectText(
      editor,
      { node: second!, offset: 0 },
      { node: second!, offset: 4 },
    );

    // A list is one block (`list` is deliberately not a BLOCK_CONTAINER), and
    // its text content is "alpha\n\nbeta" — so "beta" starts at 7, not 5.
    expect(captured).toMatchObject({
      anchor: { id: "b1", offset: 7 },
      focus: { id: "b1", offset: 11 },
      ids: ["b1"],
    });
  });

  it("addresses a block nested inside a layout by its full path", () => {
    const editor = makeEditor();
    let target: TextNode | null = null;
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      const container = $createLayoutContainerNode("1fr 1fr");
      for (const label of ["left", "right"]) {
        const item = $createLayoutItemNode();
        const paragraph = $createParagraphNode();
        const text = $createTextNode(label);
        paragraph.append(text);
        item.append(paragraph);
        container.append(item);
        if (label === "right") target = text;
      }
      root.append(container);
    }, { discrete: true });

    const captured = selectText(
      editor,
      { node: target!, offset: 0 },
      { node: target!, offset: 5 },
    );

    // Descends through the two container types the bridge addresses through:
    // first block, second column, first paragraph.
    expect(captured).toMatchObject({
      anchor: { id: "b1.2.1", offset: 0 },
      focus: { id: "b1.2.1", offset: 5 },
    });
  });

  it("is null for a collapsed caret", () => {
    const editor = makeEditor();
    const { texts } = seed(editor, [{ text: "one" }]);
    editor.update(() => {
      texts[0][0].select(2, 2);
    }, { discrete: true });

    expect(captureSelection(editor)).toBeNull();
  });

  it("is null when there is no editor and when nothing is selected", () => {
    const editor = makeEditor();
    seed(editor, [{ text: "one" }]);
    editor.update(() => $setSelection(null), { discrete: true });

    expect(captureSelection(null)).toBeNull();
    expect(captureSelection(editor)).toBeNull();
  });

  it("reports a node selection as whole blocks", () => {
    const editor = makeEditor();
    const { blocks } = seed(editor, [
      { text: "one" },
      { text: "two", id: "blk_two" },
      { text: "three" },
    ]);

    editor.update(() => {
      const selection = $createNodeSelection();
      selection.add(blocks[1].getKey());
      selection.add(blocks[2].getKey());
      $setSelection(selection);
    }, { discrete: true });

    expect(captureSelection(editor)).toEqual({
      kind: "blocks",
      ids: ["blk_two", "b3"],
    });
  });

  it("caps a very long selection and says so", () => {
    const editor = makeEditor();
    const { texts } = seed(editor, [{ text: "x".repeat(5000) }]);

    const captured = selectText(
      editor,
      { node: texts[0][0], offset: 0 },
      { node: texts[0][0], offset: 5000 },
    );

    expect(captured).toMatchObject({
      truncated: true,
      focus: { id: "b1", offset: 5000 },
    });
    expect((captured as { text: string }).text).toHaveLength(2000);
  });

  it("runs inside a read the caller already holds", () => {
    const editor = makeEditor();
    const { texts } = seed(editor, [{ text: "one" }]);
    editor.update(() => texts[0][0].select(0, 3), { discrete: true });

    expect(editor.read(() => $captureSelection())).toMatchObject({
      kind: "text",
      text: "one",
    });
  });
});
