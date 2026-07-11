// Headless Lexical <-> Markdown conversion for the content MCP server.
//
// Runs in a plain Node process (no browser). Requires the DOM shim + css loader
// from bootstrap.mjs to be installed first (the imported node classes pull in
// browser-only libraries). We reuse the editor's own TRANSFORMERS so conversion
// matches what the app produces.
import { createHeadlessEditor } from "@lexical/headless";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown";
import type { Klass, LexicalNode, LexicalNodeReplacement } from "lexical";
import { TRANSFORMERS } from "@/editor/plugins/MarkdownPlugin/MarkdownTransformers";

import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode as LexicalCodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import {
  LexicalTableCellNode,
  LexicalTableNode,
  LexicalTableRowNode,
  TableCellNode,
  TableNode,
} from "@/editor/nodes/TableNode";
import { HorizontalRuleNode } from "@/editor/nodes/HorizontalRuleNode";
import { MathNode } from "@/editor/nodes/MathNode";
import { ImageNode } from "@/editor/nodes/ImageNode";
import { SketchNode } from "@/editor/nodes/SketchNode";
import { GraphNode } from "@/editor/nodes/GraphNode";
import { StickyNode } from "@/editor/nodes/StickyNode";
import { KanbanNode } from "@/editor/nodes/KanbanNode";
import { AttachmentNode } from "@/editor/nodes/AttachmentNode";
import { PageBreakNode } from "@/editor/nodes/PageBreakNode";
import { IFrameNode } from "@/editor/nodes/IFrameNode";
import { LayoutContainerNode, LayoutItemNode } from "@/editor/nodes/LayoutNode";
import {
  DetailsContainerNode,
  DetailsContentNode,
  DetailsSummaryNode,
} from "@/editor/nodes/DetailsNode";

// Node registry covering every `type` a stored revision may contain. Unlike the
// app (src/editor/config.tsx), we register the BASE @lexical/code and
// @lexical/table nodes rather than the app's width/wrap/header subclasses: the
// subclasses exist purely for in-browser editing chrome, they share the same
// `type` strings and Markdown serialization, and registering them alongside the
// base `$createCodeNode`/table transformers trips Lexical's dev-mode
// type/klass-identity check. Markdown can't express those extra fields anyway.
const NODES: ReadonlyArray<Klass<LexicalNode> | LexicalNodeReplacement> = [
  HeadingNode,
  ListNode,
  ListItemNode,
  QuoteNode,
  LexicalCodeNode,
  CodeHighlightNode,
  // The app's table subclasses use their OWN `type` strings ("matheditor-table"
  // etc.), so — unlike code — they don't collide with the base @lexical/table
  // nodes. Register both: the custom classes parse stored tables, the base
  // replacements catch tables the Markdown transformer creates at import.
  TableNode,
  TableCellNode,
  { replace: LexicalTableNode, with: () => new TableNode() },
  {
    replace: LexicalTableCellNode,
    with: (n: LexicalTableCellNode) =>
      new TableCellNode(n.__headerState, n.__colSpan, n.__width),
  },
  LexicalTableRowNode,
  AutoLinkNode,
  LinkNode,
  HorizontalRuleNode,
  MathNode,
  ImageNode,
  SketchNode,
  GraphNode,
  StickyNode,
  KanbanNode,
  AttachmentNode,
  PageBreakNode,
  IFrameNode,
  LayoutContainerNode,
  LayoutItemNode,
  DetailsContainerNode,
  DetailsContentNode,
  DetailsSummaryNode,
];

const newEditor = () =>
  createHeadlessEditor({
    namespace: "mcp-content",
    nodes: NODES as (Klass<LexicalNode> | LexicalNodeReplacement)[],
    onError: (e) => {
      throw e;
    },
  });

// Node `type` strings that survive a Markdown round-trip (have a transformer or
// are base block/inline content). Anything else would be silently dropped on
// export, so update_post refuses when a post contains one.
const ROUND_TRIPPABLE = new Set([
  "root", "paragraph", "text", "linebreak", "tab", "heading", "quote",
  "list", "listitem", "code", "code-highlight", "link", "autolink",
  "table", "tablerow", "tablecell", "horizontalrule", "math", "image",
  "graph", "sketch",
]);

type LexicalJson = { root?: unknown } & Record<string, unknown>;

const asState = (data: unknown): string =>
  typeof data === "string" ? data : JSON.stringify(data);

/** Editor-state JSON (Revision.data) -> Markdown. */
export function editorStateToMarkdown(data: unknown): string {
  const editor = newEditor();
  editor.setEditorState(editor.parseEditorState(asState(data)));
  let md = "";
  editor.getEditorState().read(() => {
    md = $convertToMarkdownString(TRANSFORMERS);
  });
  return md;
}

/** Markdown -> editor-state JSON suitable for Revision.data. */
export function markdownToEditorState(markdown: string): LexicalJson {
  const editor = newEditor();
  editor.update(
    () => {
      $convertFromMarkdownString(markdown, TRANSFORMERS);
    },
    { discrete: true },
  );
  return editor.getEditorState().toJSON() as LexicalJson;
}

/** Collect node `type`s in a stored state that would not survive round-tripping. */
export function unsupportedNodeTypes(data: unknown): string[] {
  const found = new Set<string>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (typeof n.type === "string" && !ROUND_TRIPPABLE.has(n.type)) {
      found.add(n.type);
    }
    if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  const parsed: LexicalJson =
    typeof data === "string" ? JSON.parse(data) : (data as LexicalJson);
  walk(parsed?.root);
  return [...found];
}
