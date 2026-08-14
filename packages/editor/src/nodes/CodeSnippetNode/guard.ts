/**
 * A snippet holds files and nothing else — kept true by a transform.
 *
 * This is not defensive programming against a bug: ordinary editing produces
 * the violation. `CodeNode.collapseAtStart` (Backspace at the head of the first
 * line) does `this.replace($createParagraphNode())`, and a code block inside a
 * snippet is replaced *in place* — leaving a paragraph as a child of the
 * snippet, where the tab strip has no name for it and the reader gets an
 * uncaptioned block wedged between two files.
 *
 * The paragraph is **moved out, never deleted**: the author was mid-edit and
 * their text is not the snippet's to throw away. It lands directly after the
 * block, which is where a paragraph typed at that point would have gone.
 *
 * Import-free of React on purpose (the `dragGeometry.ts` rule) so
 * `__tests__/codeSnippet.test.ts` can register it on a headless editor and
 * exercise the real path rather than a description of it.
 */
import type { LexicalEditor } from "lexical";
import { CodeSnippetNode } from "./index";
import { CODE_SNIPPET_TYPE } from "./utils";

/** The one node type a snippet's children may be. */
const FILE_TYPE = "code";

/**
 * Move anything that is not a code block out of `node`, keeping its order.
 *
 * Compared by type string rather than by `instanceof`, so a snippet loaded into
 * an editor that registers upstream's `CodeNode` instead of ours still keeps
 * its files. (No such editor exists — `nestedConfig.tsx` refuses the snippet
 * outright — but the guard should not be the thing that decides that.)
 */
function $normalizeCodeSnippet(node: CodeSnippetNode): void {
  const strays = node.getChildren().filter((child) =>
    child.getType() !== FILE_TYPE
  );
  if (strays.length === 0) return;

  // Reversed, because each one is inserted *directly* after the snippet: going
  // forwards would leave them in the opposite order to the one they had.
  for (const stray of strays.reverse()) node.insertAfter(stray);

  // `canBeEmpty()` is false, but that only fires when a child is removed —
  // moving one out is not a removal, so the empty shell has to go by hand.
  if (node.getChildrenSize() === 0) node.remove();
}

export function registerCodeSnippetGuard(editor: LexicalEditor): () => void {
  if (!editor.hasNodes([CodeSnippetNode])) {
    throw new Error(
      `registerCodeSnippetGuard: ${CODE_SNIPPET_TYPE} is not registered on this editor`,
    );
  }
  return editor.registerNodeTransform(CodeSnippetNode, $normalizeCodeSnippet);
}
