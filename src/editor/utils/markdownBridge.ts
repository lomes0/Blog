/**
 * Lossless Markdown bridge for the Copilot agent.
 *
 * The agent works over the author's content as Markdown. Standard prose
 * (headings, lists, code, links, emphasis) round-trips through the stock
 * `@lexical/markdown` transformers. Every RICH node — math, graphs, sketches,
 * images, kanban, tables, etc. — is protected as an OPAQUE, STATELESS token
 * embedded in the Markdown:
 *
 *     [[lexblk:<base64 of the node's serialized JSON>]]
 *
 * The token carries the full node inside itself, so the round-trip needs no
 * side registry and works across documents and turns. The agent is told these
 * tokens are opaque and must be preserved verbatim — it can move or delete a
 * token but cannot corrupt what it wraps. This is deliberately conservative:
 * the agent edits prose freely and can never damage a rich node, but also
 * can't (yet) rewrite one. Making specific node types editable is a later,
 * additive step.
 *
 * Because rich nodes never reach the editor, the headless editor here needs
 * only the standard prose nodes — NOT the full editor config, which pulls in
 * browser-only deps like MathLive. That keeps the bridge light and runnable
 * anywhere (browser or server).
 */
import type {
  SerializedEditorState,
  SerializedLexicalNode,
} from "lexical";
import { createHeadlessEditor } from "@lexical/headless";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";

/**
 * Node `type` strings whose instances are protected as opaque tokens. Anything
 * not handled by the stock prose transformers goes here so it round-trips
 * losslessly instead of being silently dropped or corrupted.
 */
const OPAQUE_TYPES = new Set([
  "math",
  "graph",
  "sketch",
  "sticky",
  "image",
  "attachment",
  "iframe",
  "kanban",
  "page-break",
  "details-container",
  "layout-container",
  "table",
  "horizontalrule",
]);

/** Parents whose children are inline — a token replacing a child stays inline. */
const INLINE_PARENTS = new Set(["paragraph", "heading", "quote"]);

// A serialized element node carries a `children` array; leaf nodes don't.
interface SerializedElement extends SerializedLexicalNode {
  children?: SerializedLexicalNode[];
}
interface SerializedText extends SerializedLexicalNode {
  type: "text";
  text: string;
}

const TOKEN_RE = /\\?\[\\?\[lexblk:([A-Za-z0-9+/=]+)\\?\]\\?\]/g;
const FULL_TOKEN_RE = /^\s*\\?\[\\?\[lexblk:([A-Za-z0-9+/=]+)\\?\]\\?\]\s*$/;

// Unicode-safe base64 that works in the browser (tools run client-side) and on
// the server (Buffer) alike.
const b64encode = (s: string): string =>
  typeof Buffer !== "undefined"
    ? Buffer.from(s, "utf-8").toString("base64")
    : btoa(unescape(encodeURIComponent(s)));
const b64decode = (b: string): string =>
  typeof Buffer !== "undefined"
    ? Buffer.from(b, "base64").toString("utf-8")
    : decodeURIComponent(escape(atob(b)));

const makeToken = (node: SerializedLexicalNode): string =>
  `[[lexblk:${b64encode(JSON.stringify(node))}]]`;

const tokenTextNode = (text: string): SerializedText => ({
  type: "text",
  version: 1,
  text,
  detail: 0,
  format: 0,
  mode: "normal",
  style: "",
} as SerializedText);

const paragraph = (children: SerializedLexicalNode[]): SerializedElement => ({
  type: "paragraph",
  version: 1,
  children,
  direction: null,
  format: "",
  indent: 0,
} as SerializedElement);

/**
 * Walk the serialized tree, replacing every opaque custom node with a token.
 * Returns a new tree containing only standard, transformer-safe nodes.
 */
function stripCustomNodes(
  node: SerializedElement,
  parentType: string,
): SerializedLexicalNode {
  if (OPAQUE_TYPES.has(node.type)) {
    const token = tokenTextNode(makeToken(node));
    // Inline context keeps the token inline; block context wraps it in a
    // paragraph so the parent still holds a valid block child.
    return INLINE_PARENTS.has(parentType) ? token : paragraph([token]);
  }
  if (!node.children) return node;
  return {
    ...node,
    children: node.children.map((child) =>
      stripCustomNodes(child as SerializedElement, node.type)
    ),
  } as SerializedLexicalNode;
}

/** Reconstruct opaque nodes from tokens after a Markdown import. */
function restoreCustomNodes(
  children: SerializedLexicalNode[],
): SerializedLexicalNode[] {
  const out: SerializedLexicalNode[] = [];
  for (const child of children) {
    const el = child as SerializedElement;

    // A paragraph that is nothing but a full token → unwrap to the block node.
    if (
      el.type === "paragraph" &&
      el.children?.length === 1 &&
      el.children[0].type === "text" &&
      FULL_TOKEN_RE.test((el.children[0] as SerializedText).text)
    ) {
      const m = (el.children[0] as SerializedText).text.match(FULL_TOKEN_RE);
      out.push(JSON.parse(b64decode(m![1])) as SerializedLexicalNode);
      continue;
    }

    // An inline text node that embeds one or more tokens → split around them.
    if (el.type === "text" && TOKEN_RE.test((el as SerializedText).text)) {
      out.push(...splitInlineTokens(el as SerializedText));
      continue;
    }

    if (el.children) {
      out.push(
        { ...el, children: restoreCustomNodes(el.children) } as
          SerializedLexicalNode,
      );
      continue;
    }
    out.push(child);
  }
  return out;
}

function splitInlineTokens(textNode: SerializedText): SerializedLexicalNode[] {
  const parts: SerializedLexicalNode[] = [];
  const text = textNode.text;
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(
        { ...textNode, text: text.slice(last, m.index) } as
          SerializedLexicalNode,
      );
    }
    parts.push(JSON.parse(b64decode(m[1])) as SerializedLexicalNode);
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push(
      { ...textNode, text: text.slice(last) } as SerializedLexicalNode,
    );
  }
  return parts;
}

// A single reusable headless editor with only the standard prose nodes the
// Markdown transformers need. Rich nodes are tokenized away before they'd ever
// reach it, so none of the custom node classes (and their browser-only deps)
// are required here.
const editor = createHeadlessEditor({
  namespace: "copilot-markdown-bridge",
  onError(error: Error) {
    throw error;
  },
  nodes: [
    HeadingNode,
    QuoteNode,
    ListNode,
    ListItemNode,
    CodeNode,
    CodeHighlightNode,
    LinkNode,
    AutoLinkNode,
  ],
});

/** Serialize a Lexical document to agent-facing Markdown (rich nodes → tokens). */
export function serializedStateToMarkdown(data: SerializedEditorState): string {
  if (!data?.root?.children?.length) return "";
  const stripped: SerializedEditorState = {
    ...data,
    root: stripCustomNodes(
      data.root as unknown as SerializedElement,
      "root",
    ) as SerializedEditorState["root"],
  };
  editor.setEditorState(editor.parseEditorState(stripped));
  let markdown = "";
  editor.getEditorState().read(() => {
    markdown = $convertToMarkdownString(TRANSFORMERS);
  });
  return markdown;
}

/** Parse agent-edited Markdown back into a Lexical document (tokens → nodes). */
export function markdownToSerializedState(
  markdown: string,
): SerializedEditorState {
  editor.update(() => {
    $convertFromMarkdownString(markdown, TRANSFORMERS);
  }, { discrete: true });
  const json = editor.getEditorState().toJSON();
  return {
    ...json,
    root: {
      ...json.root,
      children: restoreCustomNodes(json.root.children),
    },
  } as SerializedEditorState;
}
