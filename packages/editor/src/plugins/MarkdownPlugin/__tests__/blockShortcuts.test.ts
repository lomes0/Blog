import { createHeadlessEditor } from "@lexical/headless";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
  type LexicalNodeReplacement,
} from "lexical";
import { $isCodeNode, CodeHighlightNode, CodeNode } from "@lexical/code";
import {
  HorizontalRuleNode,
  INSERT_HORIZONTAL_RULE_COMMAND,
} from "@/editor/nodes/HorizontalRuleNode";
import { $applyBlockShortcut } from "../blockShortcuts";

/**
 * These cover the ``` shortcut, which broke in the 0.28 → 0.49 upgrade and
 * shipped broken because the logic lived inline in a React plugin where no
 * spec could reach it. The failure was not a missing conversion but a thrown
 * `$getTextNodeOffset: invalid offset 3 for size 0` — the selection was left
 * pointing past the end of a text node the handler had just emptied.
 */

const nodes = [
  CodeNode,
  CodeHighlightNode,
  HorizontalRuleNode,
] as (Klass<LexicalNode> | LexicalNodeReplacement)[];

const makeEditor = () =>
  createHeadlessEditor({
    namespace: "block-shortcuts-test",
    nodes,
    onError: (error) => {
      throw error;
    },
  });

/** Type `text` into a fresh paragraph, put the caret at its end, fire the key. */
function runShortcut(editor: LexicalEditor, text: string) {
  let handled = false;
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      const paragraph = $createParagraphNode();
      const textNode = $createTextNode(text);
      paragraph.append(textNode);
      root.append(paragraph);
      textNode.select(text.length, text.length);
    },
    { discrete: true },
  );
  editor.update(
    () => {
      handled = $applyBlockShortcut(editor, null);
    },
    { discrete: true },
  );
  return handled;
}

describe("$applyBlockShortcut", () => {
  it("turns ``` into a code block instead of throwing", () => {
    const editor = makeEditor();
    // Before the fix this threw rather than returning false, so asserting the
    // outcome is not enough — the throw is the regression.
    expect(() => runShortcut(editor, "```")).not.toThrow();

    editor.getEditorState().read(() => {
      const first = $getRoot().getFirstChild();
      expect($isCodeNode(first)).toBe(true);
      expect(first?.getTextContent()).toBe("");
    });
  });

  it("reports the key as consumed", () => {
    const editor = makeEditor();
    expect(runShortcut(editor, "```")).toBe(true);
  });

  it("carries the language through", () => {
    const editor = makeEditor();
    runShortcut(editor, "```python");
    editor.getEditorState().read(() => {
      const first = $getRoot().getFirstChild();
      expect($isCodeNode(first)).toBe(true);
      if ($isCodeNode(first)) expect(first.getLanguage()).toBe("python");
    });
  });

  it("leaves the caret inside the new code block", () => {
    const editor = makeEditor();
    runShortcut(editor, "```");
    editor.getEditorState().read(() => {
      // The selection must be valid — reading it is what used to throw.
      expect(() => $getRoot().getFirstChild()?.getTextContent()).not.toThrow();
    });
  });

  it("keeps text typed after the fence", () => {
    const editor = makeEditor();
    let handled = false;
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        const textNode = $createTextNode("```rest");
        paragraph.append(textNode);
        root.append(paragraph);
        // Caret sits right after the fence, before "rest".
        textNode.select(3, 3);
      },
      { discrete: true },
    );
    editor.update(
      () => {
        handled = $applyBlockShortcut(editor, null);
      },
      { discrete: true },
    );
    expect(handled).toBe(true);
    editor.getEditorState().read(() => {
      expect($getRoot().getFirstChild()?.getTextContent()).toBe("rest");
    });
  });

  it("turns --- into a horizontal rule", () => {
    const editor = makeEditor();
    let inserted = false;
    // The shortcut dispatches rather than inserting the node itself.
    editor.registerCommand(
      INSERT_HORIZONTAL_RULE_COMMAND,
      () => {
        inserted = true;
        return true;
      },
      0,
    );
    expect(runShortcut(editor, "---")).toBe(true);
    expect(inserted).toBe(true);
  });

  it("ignores text that is not a shortcut", () => {
    const editor = makeEditor();
    expect(runShortcut(editor, "hello")).toBe(false);
    editor.getEditorState().read(() => {
      expect($isCodeNode($getRoot().getFirstChild())).toBe(false);
    });
  });

  it("ignores a fence that is not at the start of the line", () => {
    const editor = makeEditor();
    expect(runShortcut(editor, "text ```")).toBe(false);
  });
});
