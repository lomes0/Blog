/**
 * A block-level decorator that arrives wrapped in a paragraph gets unwrapped.
 *
 * `canvas`, `image` and `sticky` became block-level in
 * docs/plans/nested-editor-support.md §3 so the content bridge could address
 * them — an inline decorator is wrapped in a paragraph on insert, and a
 * paragraph is not a `BLOCK_CONTAINER`, so everything inside one is unreachable
 * however well the seam is written.
 *
 * Stored content still holds the old shape, and `pnpm nodes:unwrap` only
 * reaches what is in the database. This transform is what covers everything
 * else: a clipboard payload copied before the change, an import bundle, a
 * revision restored from history. It is deliberately the **same rule** as the
 * migration — literally so: both import `UNWRAPPED_BLOCK_TYPES` from
 * `@/lib/blockDecorators`, which is where that rule and the reasons for its
 * edges live.
 *
 * A paragraph holding a decorator *and* something else is left alone. Nothing
 * in this blog's 1,475 stored revisions is shaped that way (§2), and if one
 * ever is, its prose is not this transform's to move.
 *
 * Import-free of React on purpose (the `dragGeometry.ts` rule), so
 * `__tests__/blockDecoratorUnwrap.test.ts` can register it on a headless editor
 * and exercise the real path rather than a description of it.
 */
import type { Klass, LexicalEditor, LexicalNode } from "lexical";
import { $isParagraphNode } from "lexical";

import { UNWRAPPED_BLOCK_TYPES } from "@/lib/blockDecorators";

/** True when `node` is the only thing in a paragraph and may leave it. */
function $isSoleChildOfParagraph(node: LexicalNode): boolean {
  const parent = node.getParent();
  return $isParagraphNode(parent) && parent.getChildrenSize() === 1;
}

/**
 * Register the unwrap for one node class.
 *
 * Transforming the *decorator* rather than the paragraph is what keeps the rule
 * owned by the node that needs it: each plugin registers its own, so a node
 * that is later made block-level cannot inherit the behaviour by accident, and
 * one that is made inline again stops getting it by deleting a line.
 */
export function registerBlockDecoratorUnwrap<T extends LexicalNode>(
  editor: LexicalEditor,
  klass: Klass<T>,
): () => void {
  return editor.registerNodeTransform(klass, (node) => {
    if (!UNWRAPPED_BLOCK_TYPES.has(node.getType())) return;
    if (!$isSoleChildOfParagraph(node)) return;
    // `replace` detaches `node` from the paragraph before putting it where the
    // paragraph was, so the paragraph goes with it rather than being left empty.
    node.getParentOrThrow().replace(node);
  });
}
