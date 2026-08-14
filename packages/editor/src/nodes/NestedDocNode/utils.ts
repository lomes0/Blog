/**
 * The nested doc's type string and a structural view of its node.
 *
 * Both live here rather than in `index.tsx` for the reason `CanvasNode/utils.ts`
 * gives: `NestedDocComponent` has to mutate the node it decorates, and importing
 * the class to narrow to it would close a cycle between the node module and its
 * component module.
 */
import type { LexicalEditor, LexicalNode } from "lexical";

export const NESTED_DOC_TYPE = "nested-doc";

/** What the card needs of the node, without needing the class. */
export interface NestedDocNodeLike {
  getTitle(): string;
  setTitle(title: string): unknown;
  getOpen(): boolean;
  toggleOpen(): unknown;
  getDoc(): LexicalEditor;
}

export function $asNestedDocNode(
  node: LexicalNode | null | undefined,
): NestedDocNodeLike | null {
  if (!node || node.getType() !== NESTED_DOC_TYPE) return null;
  return node as unknown as NestedDocNodeLike;
}
