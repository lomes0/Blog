/**
 * Block IR <-> Lexical nodes (plan §4.6).
 *
 * Phase 1 gives codecs to paragraph, heading, quote, list and code. Everything
 * else is **opaque**: readable, addressable, movable, deletable — never
 * rewritten. Per §4.1 that costs nothing, because an untouched node is
 * preserved by not being touched, so graduating a type later is additive and
 * has no correctness deadline.
 *
 * ### Carry-through (§4.6.1)
 *
 * A clean IR is the hazard: `{ type: "code", language, code }` says nothing
 * about the app's `width` or `wrap`, so building a node from the IR alone would
 * strip them. Every write therefore takes the node it is replacing and spreads
 * it, so fields the IR does not model survive by default and a codec has to opt
 * *out* of preserving something rather than opt in.
 */
import type {
  Block,
  CodeBlock,
  HeadingBlock,
  ListBlock,
  ListItem,
  ParagraphBlock,
  QuoteBlock,
  SerializedNode,
  WritableBlock,
} from "./types";
import { parseInline, renderInline } from "./inline";

const childrenOf = (node: SerializedNode): SerializedNode[] =>
  Array.isArray(node.children) ? node.children : [];

const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

/**
 * Plain text of a subtree — the read-only fallback when inline is unspellable.
 *
 * A node carrying neither text nor children (a canvas embedded mid-paragraph,
 * say) contributes a descriptor rather than nothing. Otherwise a paragraph
 * wrapping one reads back as empty, and the outline says a block is there and
 * read-only without ever saying what it is.
 */
function plainText(nodes: readonly SerializedNode[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "linebreak") out += "\n";
    else if (typeof node.text === "string") out += node.text;
    else if (node.children) out += plainText(childrenOf(node));
    else out += `[${describeNode(node)}]`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Opaque descriptors
// ---------------------------------------------------------------------------

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * A one-line summary of a block with no codec.
 *
 * This is **shape, not content** (plan §4.4): it says the block is there and
 * roughly what it is. Where a cheap read-only text extraction exists it is
 * included, because that closes most of the gap at no write-path risk.
 */
export function describeNode(node: SerializedNode): string {
  const kids = childrenOf(node);
  switch (node.type) {
    case "kanban": {
      const tasks = Array.isArray(node.tasks) ? node.tasks : [];
      const lanes = new Set(
        tasks.map((t) => (t as { stage?: unknown }).stage ?? 0),
      ).size;
      return `${plural(lanes, "lane")} · ${plural(tasks.length, "card")}`;
    }
    case "layout-container": {
      const columns = str(node.templateColumns).trim().split(/\s+/).filter(Boolean);
      return plural(columns.length, "column");
    }
    case "details-container": {
      const summary = kids.find((k) => k.type === "details-summary");
      const label = summary ? plainText(childrenOf(summary)).trim() : "";
      return label ? `"${label}"` : "collapsible";
    }
    case "math":
      return str(node.value);
    case "graph":
      return `geogebra${str(node.altText) ? ` · ${str(node.altText)}` : ""}`;
    case "sketch":
      return "excalidraw drawing";
    case "image":
      return str(node.altText) || str(node.src);
    case "iframe":
      return str(node.src);
    case "attachment":
      return `${str(node.filename)}${node.size ? ` · ${node.size} bytes` : ""}`;
    case "sticky":
      return "sticky note";
    case "canvas": {
      const notes = Array.isArray(node.notes) ? node.notes.length : 0;
      return plural(notes, "note");
    }
    case "horizontalrule":
      return "divider";
    case "pagebreak":
      return "page break";
    case "table": {
      const rows = kids.filter((k) => k.type === "tablerow");
      const columns = rows[0] ? childrenOf(rows[0]).length : 0;
      return `${plural(rows.length, "row")} × ${plural(columns, "column")}`;
    }
    default:
      return node.type;
  }
}

// ---------------------------------------------------------------------------
// Read: node -> Block
// ---------------------------------------------------------------------------

const headingLevel = (tag: string): HeadingBlock["level"] => {
  const level = Number(tag.replace(/^h/i, ""));
  return level >= 1 && level <= 6 ? (level as HeadingBlock["level"]) : 1;
};

/** A list whose items nest another list cannot be flattened and back safely. */
const hasNestedList = (node: SerializedNode): boolean =>
  childrenOf(node).some((item) =>
    childrenOf(item).some((child) => child.type === "list"),
  );

function readListItems(node: SerializedNode): {
  items: ListItem[];
  readonlyText: boolean;
} {
  let readonlyText = false;
  const items = childrenOf(node)
    .filter((item) => item.type === "listitem")
    .map((item) => {
      const kids = childrenOf(item);
      const text = renderInline(kids);
      if (text === null) readonlyText = true;
      const listItem: ListItem = {
        text: text ?? plainText(kids),
        indent: typeof item.indent === "number" ? item.indent : 0,
      };
      if (typeof item.checked === "boolean") listItem.checked = item.checked;
      return listItem;
    });
  return { items, readonlyText };
}

/** Read one node as a block. Never throws: an unknown type reads as opaque. */
export function nodeToBlock(node: SerializedNode): Block {
  const kids = childrenOf(node);

  switch (node.type) {
    case "paragraph":
    case "quote": {
      const text = renderInline(kids);
      const block = {
        type: node.type,
        text: text ?? plainText(kids),
      } as ParagraphBlock | QuoteBlock;
      if (text === null) block.readonlyText = true;
      return block;
    }
    case "heading": {
      const text = renderInline(kids);
      const block: HeadingBlock = {
        type: "heading",
        level: headingLevel(str(node.tag, "h1")),
        text: text ?? plainText(kids),
      };
      if (text === null) block.readonlyText = true;
      return block;
    }
    case "code": {
      const block: CodeBlock = {
        type: "code",
        language: str(node.language),
        code: plainText(kids),
      };
      return block;
    }
    case "list": {
      // Nesting is expressed by a list inside a list item, which this flat IR
      // cannot round-trip. Reading it as opaque keeps it whole.
      if (hasNestedList(node)) {
        return { type: "opaque", nodeType: "list", summary: "nested list" };
      }
      const listType = str(node.listType, "bullet");
      const { items, readonlyText } = readListItems(node);
      const block: ListBlock = {
        type: "list",
        listType:
          listType === "number" || listType === "check" ? listType : "bullet",
        items,
      };
      if (readonlyText) block.readonlyText = true;
      return block;
    }
    default:
      return {
        type: "opaque",
        nodeType: node.type,
        summary: describeNode(node),
      };
  }
}

// ---------------------------------------------------------------------------
// Write: Block -> node
// ---------------------------------------------------------------------------

/** Defaults every element node needs; a `previous` node overrides all of them. */
const ELEMENT_DEFAULTS = {
  version: 1,
  direction: null,
  format: "",
  indent: 0,
} as const;

const LIST_TYPE_TAG = { bullet: "ul", number: "ol", check: "ul" } as const;

/** A plain text leaf — code bodies are re-tokenized by the editor on load. */
const textLeaf = (text: string): SerializedNode => ({
  type: "text",
  version: 1,
  text,
  detail: 0,
  format: 0,
  mode: "normal",
  style: "",
});

/** Phase-1 codecs all name their node type directly. */
const blockTypeToNodeType = (block: WritableBlock): string => block.type;

function listItemNode(item: ListItem, index: number): SerializedNode {
  const node: SerializedNode = {
    ...ELEMENT_DEFAULTS,
    type: "listitem",
    value: index + 1,
    indent: Number.isInteger(item.indent) && item.indent > 0 ? item.indent : 0,
    children: parseInline(item.text ?? ""),
  };
  if (typeof item.checked === "boolean") node.checked = item.checked;
  return node;
}

/**
 * Build a node from a block.
 *
 * `previous` is the node being replaced, if any. Spreading it first is the
 * §4.6.1 carry-through rule in one line: anything the IR does not model —
 * `width` and `wrap` on a code node, element alignment, indent — survives,
 * and a codec has to overwrite a field deliberately to lose it.
 */
export function blockToNode(
  block: WritableBlock,
  previous?: SerializedNode,
): SerializedNode {
  // Only carry through from a node of the same kind; a paragraph's leftovers
  // have no business on a code block.
  const carried =
    previous && previous.type === blockTypeToNodeType(block) ? previous : undefined;
  const base = { ...ELEMENT_DEFAULTS, ...carried };

  switch (block.type) {
    case "paragraph":
      return { ...base, type: "paragraph", children: parseInline(block.text ?? "") };
    case "quote":
      return { ...base, type: "quote", children: parseInline(block.text ?? "") };
    case "heading": {
      const level = block.level;
      if (!Number.isInteger(level) || level < 1 || level > 6) {
        throw new Error(`heading level must be 1-6, got ${String(level)}`);
      }
      return {
        ...base,
        type: "heading",
        tag: `h${level}`,
        children: parseInline(block.text ?? ""),
      };
    }
    case "code":
      return {
        ...base,
        type: "code",
        language: str(block.language, "plain"),
        children: block.code ? [textLeaf(block.code)] : [],
      };
    case "list": {
      const listType = block.listType ?? "bullet";
      if (!(listType in LIST_TYPE_TAG)) {
        throw new Error(
          `list type must be bullet, number or check, got ${String(listType)}`,
        );
      }
      const items = Array.isArray(block.items) ? block.items : [];
      return {
        ...base,
        type: "list",
        listType,
        start: 1,
        tag: LIST_TYPE_TAG[listType],
        children: items.map(listItemNode),
      };
    }
    default: {
      const unreachable = block as { type: string };
      throw new Error(`no codec for block type "${unreachable.type}"`);
    }
  }
}

/**
 * True when this block's text may be edited in place — see `TextOpacity`.
 *
 * A code block is never text-opaque: its body is literal, so there is no inline
 * formatting to lose. Hence the `in` check rather than a field access.
 */
export const isTextEditable = (block: Block): boolean =>
  block.type !== "opaque" &&
  !("readonlyText" in block && block.readonlyText === true);
