/**
 * Reading a document: skeleton first, bodies on demand (plan §4.4).
 *
 * `outline` is the cheap navigation surface — one line per block, so reviewing
 * a twelve-post series costs twelve outlines rather than twelve full bodies.
 * `readBlocks` then pulls only what the caller actually needs.
 *
 * A block with no codec still appears, with a descriptor. That is the whole
 * difference from the Markdown transport this replaces: a kanban board is
 * *visible, addressable and movable* rather than absent and unmentioned. It is
 * still shape rather than content — the descriptor says "3 lanes · 11 cards",
 * not what the cards say.
 */
import type {
  Address,
  AddressedBlock,
  Block,
  ListItem,
  StoredState,
} from "./types";
import { formatAddress, walkBlocks } from "./address";
import { canSetText, nodeToBlock } from "./blocks";
import { stateHash } from "./stateHash";

export interface OutlineEntry {
  id: Address;
  /** Nesting level; 0 for a top-level block. */
  depth: number;
  /** `paragraph`, `heading[2]`, `list[check]`, `code[ts]`, or the node type. */
  kind: string;
  /** A text preview for prose, or the descriptor for an opaque block. */
  preview: string;
  /** Length of the block's text, where it has any. */
  chars?: number;
  /** False only for opaque blocks: whether `replace_block` can rewrite it. */
  editable: boolean;
  /** Whether `set_text` works — false for blocks with no single text field. */
  textEditable: boolean;
}

export interface Outline {
  stateHash: string;
  blocks: OutlineEntry[];
}

const PREVIEW_LIMIT = 80;

const truncate = (text: string): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_LIMIT
    ? `${flat.slice(0, PREVIEW_LIMIT - 1)}…`
    : flat;
};

function kindOf(block: Block): string {
  switch (block.type) {
    case "heading":
      return `heading[${block.level}]`;
    case "list":
      return `list[${block.listType}]`;
    case "code":
      return block.language ? `code[${block.language}]` : "code";
    case "opaque":
      return block.nodeType;
    default:
      return block.type;
  }
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

const countItems = (items: readonly ListItem[]): number =>
  items.reduce(
    (total, item) =>
      total + 1 + (item.sublist ? countItems(item.sublist.items) : 0),
    0,
  );

const listDepth = (items: readonly ListItem[]): number =>
  items.reduce(
    (deepest, item) =>
      Math.max(deepest, item.sublist ? 1 + listDepth(item.sublist.items) : 1),
    0,
  );

function entryFor(block: Block): { preview: string; chars?: number } {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
    case "summary":
      return { preview: truncate(block.text), chars: block.text.length };
    case "code": {
      const lines = block.code === "" ? 0 : block.code.split("\n").length;
      return {
        preview: `${lines} line${lines === 1 ? "" : "s"}`,
        chars: block.code.length,
      };
    }
    case "list": {
      // Count the whole tree: a list of 3 items each with 4 children is not a
      // "3 item" list to anyone deciding whether to read it.
      const count = countItems(block.items);
      const depth = listDepth(block.items);
      const first = block.items.find((item) => item.text)?.text ?? "";
      return {
        preview: `${plural(count, "item")}${
          depth > 1 ? `, ${depth} levels` : ""
        }${first ? ` · ${truncate(first)}` : ""}`,
      };
    }
    case "divider":
      return { preview: "———" };
    case "layout":
      return { preview: block.templateColumns };
    case "details":
      return {
        preview: `${block.open === false ? "closed" : "open"} · ${
          truncate(block.summary)
        }`,
      };
    case "kanban": {
      const lanes = new Set(block.tasks.map((task) => task.stage)).size;
      return {
        preview: `${plural(lanes, "lane")} · ${
          plural(block.tasks.length, "card")
        }`,
      };
    }
    case "attachment":
      return {
        preview: `${block.filename}${
          block.size ? ` · ${block.size} bytes` : ""
        }`,
      };
    case "table":
      return {
        preview: `${plural(block.rowCount, "row")} × ${
          plural(block.columnCount, "column")
        }`,
      };
    case "cell": {
      const spans = [
        block.header ? `${block.header} header` : "",
        block.colSpan ? `colspan ${block.colSpan}` : "",
        block.rowSpan ? `rowspan ${block.rowSpan}` : "",
      ].filter(Boolean);
      return {
        preview: `${truncate(block.text)}${
          spans.length ? `  (${spans.join(", ")})` : ""
        }`,
        chars: block.text.length,
      };
    }
    case "opaque":
      // Truncated like prose: a table row's descriptor is every cell in it,
      // which is useful but can run to hundreds of characters.
      return { preview: truncate(block.summary) };
  }
}

/** The skeleton: every addressable block, in document order. */
export function outline(state: StoredState): Outline {
  const blocks = walkBlocks(state).map(({ address, depth, node }) => {
    const block = nodeToBlock(node);
    const { preview, chars } = entryFor(block);
    const entry: OutlineEntry = {
      id: address,
      depth,
      kind: kindOf(block),
      preview,
      editable: block.type !== "opaque",
      textEditable: canSetText(block),
    };
    if (chars !== undefined) entry.chars = chars;
    return entry;
  });

  return { stateHash: stateHash(state), blocks };
}

/**
 * Render an outline the way §4.4 shows it — for a terminal, not for parsing.
 *
 * Blocks are marked with what they will refuse, because the alternative is the
 * caller discovering it by having a write rejected: `[read-only]` cannot be
 * rewritten at all, `[replace only]` has no single text field for `set_text`.
 */
export function formatOutline(result: Outline): string {
  return result.blocks
    .map(({ id, depth, kind, preview, chars, editable, textEditable }) => {
      const indent = "  ".repeat(depth);
      const size = chars !== undefined && chars > 0 ? `  (${chars} chars)` : "";
      const note = !editable
        ? "  [read-only]"
        : textEditable
        ? ""
        : "  [replace only]";
      // Trailing spaces, not just padding: an address or kind longer than its
      // column would otherwise run straight into the next one — a persistent
      // id is wider than a path ("blk_7ughz1heading[1]").
      return `${id.padEnd(10)} ${indent}${
        kind.padEnd(15)
      } ${preview}${size}${note}`;
    })
    .join("\n");
}

export interface BlocksRead {
  stateHash: string;
  blocks: AddressedBlock[];
  /** Addresses that matched nothing, rather than silently returning fewer. */
  missing: Address[];
}

/** Full content for the named blocks. */
export function readBlocks(
  state: StoredState,
  ids: readonly Address[],
): BlocksRead {
  const wanted = new Set(ids);
  const found = new Map<Address, AddressedBlock>();

  for (const { address, path, node } of walkBlocks(state)) {
    // Accept either spelling: a stamped block is addressed by its id, but a
    // caller may be holding the structural path from an earlier read.
    const asPath = formatAddress(path);
    if (!wanted.has(address) && !wanted.has(asPath)) continue;
    const block = { ...nodeToBlock(node), id: address };
    if (wanted.has(address)) found.set(address, block);
    if (wanted.has(asPath)) found.set(asPath, block);
  }

  return {
    stateHash: stateHash(state),
    blocks: ids.map((id) => found.get(id)).filter((b): b is AddressedBlock =>
      !!b
    ),
    missing: ids.filter((id) => !found.has(id)),
  };
}

/** The whole document as blocks, nested — for documents small enough to read whole. */
export function readAll(state: StoredState): {
  stateHash: string;
  blocks: AddressedBlock[];
} {
  // Keyed by structural path, never by the block's own address: a stamped
  // block is addressed by its id, so looking a parent up by path would miss.
  const byPath = new Map<string, AddressedBlock>();
  const roots: AddressedBlock[] = [];

  for (const { address, node, path } of walkBlocks(state)) {
    const block: AddressedBlock = { ...nodeToBlock(node), id: address };
    byPath.set(formatAddress(path), block);

    if (path.length === 1) {
      roots.push(block);
      continue;
    }
    const parent = byPath.get(formatAddress(path.slice(0, -1)));
    if (parent) (parent.children ??= []).push(block);
  }

  return { stateHash: stateHash(state), blocks: roots };
}
