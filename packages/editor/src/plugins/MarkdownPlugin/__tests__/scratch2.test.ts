import { createHeadlessEditor } from "@lexical/headless";
import {
  $createParagraphNode, $createTextNode, $getRoot, $getSelection, $isRangeSelection,
  $isTextNode, type Klass, type LexicalEditor, type LexicalNode, type LexicalNodeReplacement,
} from "lexical";
import { editorConfig } from "@/editor/config";

it("diag", () => {
  const editor = createHeadlessEditor({
    namespace: editorConfig.namespace,
    nodes: editorConfig.nodes as (Klass<LexicalNode> | LexicalNodeReplacement)[],
    onError: (e) => { throw e; },
  });
  editor.registerUpdateListener(({ tags, dirtyLeaves, editorState, prevEditorState }) => {
    const sel = editorState.read($getSelection);
    const prev = prevEditorState.read($getSelection);
    const anchorKey = $isRangeSelection(sel) ? sel.anchor.key : null;
    console.log("UL", {
      tags: [...tags],
      dirtyLeaves: [...dirtyLeaves],
      sel: $isRangeSelection(sel) ? [sel.anchor.key, sel.anchor.offset, sel.isCollapsed()] : String(sel),
      prev: $isRangeSelection(prev) ? [prev.anchor.key, prev.anchor.offset] : String(prev),
      same: $isRangeSelection(sel) && $isRangeSelection(prev) ? sel.is(prev) : null,
      anchorIsText: anchorKey ? $isTextNode(editorState._nodeMap.get(anchorKey)) : null,
      inDirty: anchorKey ? dirtyLeaves.has(anchorKey) : null,
    });
  });
  editor.update(() => {
    const root = $getRoot(); root.clear();
    const p = $createParagraphNode(); const t = $createTextNode("");
    p.append(t); root.append(p); t.select(0, 0);
  }, { discrete: true });
  for (const ch of "# ") {
    editor.update(() => {
      const sel = $getSelection();
      if ($isRangeSelection(sel)) sel.insertText(ch);
    }, { discrete: true });
  }
});
