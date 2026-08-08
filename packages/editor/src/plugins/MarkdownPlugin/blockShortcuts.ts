import {
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
  TextNode,
} from "lexical";
import { $createCodeNode } from "@lexical/code";
import { $setBlocksType } from "@lexical/selection";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@/editor/nodes/HorizontalRuleNode";

const CODE_FENCE = /^```(\w*)$/;
const THEMATIC_BREAK = /^(-{3,}|\*{3,}|_{3,}|={3,})$/;

/**
 * The ``` and --- block shortcuts, which fire on the space/enter key *before*
 * the character is inserted — which is why they are ours rather than
 * `@lexical/markdown`'s, whose multiline transformer only sees the line once
 * the trigger character has landed.
 *
 * Lives outside the plugin so it can be driven by a headless editor. The
 * version that lived inline in the component was untestable, and shipped a
 * selection bug through the 0.49 upgrade unnoticed for exactly that reason.
 *
 * Must be called inside `editor.update()`. Returns whether it consumed the key.
 */
export function $applyBlockShortcut(
  editor: LexicalEditor,
  event: KeyboardEvent | null,
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

  const anchorNode = selection.anchor.getNode();
  if (!(anchorNode instanceof TextNode)) return false;

  const textContent = anchorNode.getTextContent();
  const offset = selection.anchor.offset;
  const textBeforeCursor = textContent.slice(0, offset);

  const codeBlockMatch = textBeforeCursor.match(CODE_FENCE);
  if (codeBlockMatch) {
    event?.preventDefault();
    const language = codeBlockMatch[1] || undefined;

    // Drop the trigger text, then re-anchor the selection before handing it to
    // $setBlocksType. It still points at `offset` — past the end of the node we
    // just shortened — and 0.49 validates that where 0.28 tolerated it, so
    // reading it throws `$getTextNodeOffset: invalid offset N for size 0`,
    // aborting the update and leaving the literal ``` in the paragraph.
    anchorNode.setTextContent(textContent.slice(offset));
    anchorNode.select(0, 0);

    const reanchored = $getSelection();
    if (!$isRangeSelection(reanchored)) return false;
    $setBlocksType(reanchored, () => $createCodeNode(language));
    return true;
  }

  if (THEMATIC_BREAK.test(textBeforeCursor)) {
    event?.preventDefault();
    anchorNode.getParent()?.remove();
    editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
    return true;
  }

  return false;
}
