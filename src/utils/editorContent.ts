import type { SerializedEditorState } from "lexical";

export interface OutlineHeading {
  text: string;
  level: 2 | 3;
  key: string;
}

type SerializedNode = {
  type: string;
  tag?: string;
  text?: string;
  children?: SerializedNode[];
};

function traverse(
  nodes: SerializedNode[],
  cb: (node: SerializedNode) => void,
) {
  for (const node of nodes) {
    cb(node);
    if (node.children) traverse(node.children, cb);
  }
}

function nodeText(node: SerializedNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.children) return node.children.map(nodeText).join("");
  return "";
}

export function extractHeadings(
  data: SerializedEditorState | undefined,
): OutlineHeading[] {
  const root = data?.root as SerializedNode | undefined;
  if (!root?.children) return [];
  const headings: OutlineHeading[] = [];
  traverse(root.children, (node) => {
    if (node.type === "heading" && node.tag) {
      const level = parseInt(node.tag.slice(1), 10);
      if (level === 2 || level === 3) {
        const text = nodeText(node).trim();
        if (text) headings.push({ text, level: level as 2 | 3, key: text });
      }
    }
  });
  return headings;
}

export function countWords(data: SerializedEditorState | undefined): number {
  const root = data?.root as SerializedNode | undefined;
  if (!root?.children) return 0;
  const parts: string[] = [];
  traverse(root.children, (node) => {
    if (node.type === "text" && node.text) parts.push(node.text);
  });
  return parts.join(" ").trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Words per minute — the divisor behind every read-time estimate in the app.
 *
 * 200 is the number both existing call sites had already settled on; it lives
 * here so there is one of it.
 */
export const WORDS_PER_MIN = 200;

/**
 * Minutes to read `wordCount` words: rounded up, floored at one for a document
 * that has any words at all, and **zero** for one that has none.
 *
 * This one line was derived independently in three places — the right rail's
 * Outline, the right rail's Properties, and now the workspace status bar — and
 * the two that existed had already drifted: Outline divided by a named
 * `WORDS_PER_MIN`, Properties by a literal `200`. They agreed by luck. A
 * reading rate that differs between two panels of the same window is a bug
 * nobody reports, so it gets a single home rather than a third copy.
 *
 * The zero case is the one behavioural change. Both prior call sites render
 * only when `countWords(...) > 0`, so `Math.max(1, ...)` never applied to an
 * empty document there and nothing moves; the status bar has no such guard and
 * needs "no content yet" to be distinguishable from "a one-minute read".
 */
export const readingMinutes = (wordCount: number): number =>
  wordCount > 0 ? Math.max(1, Math.ceil(wordCount / WORDS_PER_MIN)) : 0;
