import { createHeadlessEditor } from "@lexical/headless";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
  type LexicalNodeReplacement,
  TextNode,
  KEY_SPACE_COMMAND,
  KEY_ENTER_COMMAND,
  COMMAND_PRIORITY_LOW,
} from "lexical";
import { registerMarkdownShortcuts } from "@lexical/markdown";
import { $setBlocksType } from "@lexical/selection";
import { editorConfig } from "@/editor/config";
import { createTransformers } from "../MarkdownTransformers";
import { $createCodeNode } from "@lexical/code";

function newEditor() {
  const editor = createHeadlessEditor({
    namespace: editorConfig.namespace,
    nodes: editorConfig.nodes as (Klass<LexicalNode> | LexicalNodeReplacement)[],
    onError: (e) => { throw e; },
  });
  registerMarkdownShortcuts(editor, createTransformers(editor));
  return editor;
}

function seed(editor: LexicalEditor) {
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    const p = $createParagraphNode();
    const t = $createTextNode("");
    p.append(t);
    root.append(p);
    t.select(0, 0);
  }, { discrete: true });
}

function type(editor: LexicalEditor, text: string) {
  for (const ch of text) {
    editor.update(() => {
      const sel = $getSelection();
      if ($isRangeSelection(sel)) sel.insertText(ch);
    }, { discrete: true });
  }
}

function dump(editor: LexicalEditor) {
  editor.update(() => {}, { discrete: true });
  return editor.getEditorState().read(() =>
    $getRoot().getChildren().map((n) => `${n.getType()}${(n as unknown as {getLanguage?: () => string}).getLanguage ? "[" + (n as unknown as {getLanguage: () => string}).getLanguage() + "]" : ""}:${JSON.stringify(n.getTextContent())}`)
  );
}

it("A: ``` + space via shortcuts only", () => {
  const editor = newEditor();
  seed(editor);
  type(editor, "``` ");
  console.log("A", dump(editor));
});

it("B: ``` + enter via shortcuts only", () => {
  const editor = newEditor();
  seed(editor);
  type(editor, "```");
  editor.update(() => {}, { discrete: true });
  // simulate Enter
  editor.dispatchCommand(KEY_ENTER_COMMAND, null);
  console.log("B", dump(editor));
});

it("C: enhancement plugin logic on space", () => {
  const editor = newEditor();
  // replicate MarkdownShortcutEnhancementPlugin
  editor.registerCommand(KEY_SPACE_COMMAND, (event: KeyboardEvent | null) => {
    let handled = false;
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
      const anchor = selection.anchor;
      const anchorNode = anchor.getNode();
      if (!(anchorNode instanceof TextNode)) return;
      const textContent = anchorNode.getTextContent();
      const offset = anchor.offset;
      const textBeforeCursor = textContent.substring(0, offset);
      const codeBlockMatch = textBeforeCursor.match(/^```(\w*)$/);
      if (codeBlockMatch) {
        event?.preventDefault();
        const language = codeBlockMatch[1] || undefined;
        anchorNode.setTextContent(textContent.substring(offset));
        $setBlocksType(selection, () => $createCodeNode(language));
        handled = true;
        return;
      }
    }, { discrete: true });
    return handled;
  }, COMMAND_PRIORITY_LOW);
  seed(editor);
  type(editor, "```");
  let err: unknown = null;
  try {
    editor.dispatchCommand(KEY_SPACE_COMMAND, null as never);
  } catch (e) { err = e; }
  console.log("C err:", err instanceof Error ? err.message : err);
  console.log("C", dump(editor));
});

it("E: enter shortcuts", () => {
  for (const s of ["```", "```js", "```objective-c", "---", "$$"]) {
    const editor = newEditor();
    seed(editor);
    type(editor, s);
    editor.update(() => {}, { discrete: true });
    editor.dispatchCommand(KEY_ENTER_COMMAND, null);
    console.log("E", JSON.stringify(s), dump(editor));
  }
});

it("D: other shortcuts", () => {
  for (const s of ["# ", "## ", "> ", "* ", "1. ", "--- ", "```js ", "```objective-c ", "$$ ", "$$x^2$$ "]) {
    const editor = newEditor();
    seed(editor);
    type(editor, s);
    console.log("D", JSON.stringify(s), dump(editor));
  }
});
