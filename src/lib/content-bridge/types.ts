/**
 * Shared shapes for the content bridge (docs/plans/archive/claude-code-lexical.md).
 *
 * **The bridge works on serialized JSON, not on a live editor.** The plan's
 * §4.1 describes the applier as loading "the real editor state"; operating on
 * the stored JSON directly is strictly better here, for three reasons:
 *
 *   1. The preservation guarantee becomes literal. An untouched subtree is the
 *      same object, so "comes out byte-identical" is true by construction
 *      rather than by trusting a round-trip through node classes.
 *   2. It removes the headless-editor fragility (plan §9): registering every
 *      node class drags in browser-only dependencies behind a DOM shim, and any
 *      new node that touches `document` at import time breaks the server.
 *   3. The same code runs unchanged in the browser and in Node, with no DOM and
 *      no `@lexical/headless`, which is what makes it testable in the default
 *      vitest environment.
 *
 * The cost is that nodes minted here are hand-built rather than produced by a
 * node class, so each codec owes a round-trip spec (plan §4.6.1).
 */

/** A node as it appears inside a stored `Revision.data`. */
export interface SerializedNode {
  type: string;
  children?: SerializedNode[];
  [key: string]: unknown;
}

/** A stored editor state — `Revision.data`'s shape. */
export interface StoredState {
  root: SerializedNode;
  [key: string]: unknown;
}

/**
 * A block address: `b3`, or `b4.2` for the second child of the fourth block.
 * Minted per read from document order and never stored (plan §4.2).
 */
export type Address = string;

// ---------------------------------------------------------------------------
// Block IR
// ---------------------------------------------------------------------------

/**
 * Set when the block's inline content carries something `inline.ts` cannot
 * spell — an inline text colour, say. The text is then a plain-text rendering
 * for reading only, and `set_text` refuses rather than flatten the formatting
 * it cannot see (plan §4.5).
 */
export interface TextOpacity {
  readonlyText?: true;
}

export interface ParagraphBlock extends TextOpacity {
  type: "paragraph";
  /** Inline runs as restricted Markdown — see `inline.ts`. */
  text: string;
}

export interface HeadingBlock extends TextOpacity {
  type: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

export interface QuoteBlock extends TextOpacity {
  type: "quote";
  text: string;
}

export type ListType = "bullet" | "number" | "check";

/** A list hanging off a list item. Nesting is 1–4 deep in practice. */
export interface NestedList {
  listType: ListType;
  items: ListItem[];
}

export interface ListItem {
  text: string;
  /** Present only for checklists. */
  checked?: boolean;
  /**
   * A list nested under this item.
   *
   * Nesting is structural, not an indent level. Lexical stores it as a `list`
   * inside a `listitem`, and writes `indent` alongside — but across every
   * stored list in this blog `indent` is *exactly* the nesting depth minus one,
   * so it carries no information the structure does not. It is therefore
   * derived on write rather than exposed, which makes an item whose indent
   * disagrees with its nesting unrepresentable rather than merely unlikely.
   */
  sublist?: NestedList;
}

export interface ListBlock extends TextOpacity {
  type: "list";
  listType: ListType;
  items: ListItem[];
}

export interface CodeBlock {
  type: "code";
  language: string;
  code: string;
  /**
   * The file's name, when this block is one file of a `code-snippet`
   * (docs/plans/archive/haklex-reprise.md §6.2). Absent on a code block that
   * is not.
   *
   * It lives on the file rather than on the snippet because the snippet's
   * children are spliced by `move_block` and `delete_block`, which know nothing
   * about it — a parallel array of names on the wrapper would come out of the
   * first reorder attached to the wrong files. See `CodeNode.__filename`.
   */
  filename?: string;
}

/**
 * A multi-file code snippet: a tab strip over one code block per file.
 *
 * The codec covers the **wrapper only**. Its files are real Lexical children,
 * so each is addressed in its own right (`b7.1`, `b7.2`) and read and written
 * by the `code` codec that already existed — this is the container that needs
 * no arm in `containers.ts` at all, only a line in `BLOCK_CONTAINERS`.
 *
 * `files` follows the same rule as `LayoutBlock.columns`: absent on a read,
 * required when inserting a new one, optional when replacing. `filenames` is
 * the read-only counterpart, the way a table reports `rowCount` and is written
 * with `rows` — without it the outline could say a snippet is there and not
 * what is in it, because the wrapper node holds no names of its own.
 */
export interface CodeSnippetBlock {
  type: "code-snippet";
  /** Which file the tab strip opens on, 1-based like an address. Default 1. */
  active?: number;
  /** Read-only: the tab labels, in order. Write them through `files`. */
  filenames?: string[];
  files?: CodeBlock[];
}

export interface DividerBlock {
  type: "divider";
}

/**
 * A multi-column layout.
 *
 * `columns` is absent on a read, because each column is addressed in its own
 * right (`b4.1`, `b4.2`) and reading it here would duplicate them. On a write
 * it is optional: supplied, it replaces the columns; omitted on a replace, the
 * existing columns are kept. Inserting a new layout must supply it.
 */
export interface LayoutBlock {
  type: "layout";
  /** A CSS grid track list, e.g. `"1fr 1fr"`. */
  templateColumns: string;
  columns?: WritableBlock[][];
}

/**
 * A collapsible section. `body` follows the same rule as `LayoutBlock.columns`:
 * absent on a read because the contents are addressed in their own right,
 * optional on a write. It is not called `children` because an `AddressedBlock`
 * already uses that name for the nesting a read hands back.
 */
export interface DetailsBlock {
  type: "details";
  summary: string;
  open?: boolean;
  body?: WritableBlock[];
}

/**
 * A document embedded in a document
 * (docs/plans/archive/haklex-reprise.md §6.1).
 *
 * The codec covers the **wrapper only** — its title and whether the card shows
 * its contents. The interior is a nested editor whose blocks are addressed in
 * their own right (`b7.1`, `b7.2`) through `containers.ts`, so every existing
 * codec already works inside one and this needs no codec of its own. `body`
 * follows the same rule as `LayoutBlock.columns`: absent on a read, required
 * when inserting a new one, optional when replacing.
 *
 * **Not everything may go in the body.** The nested editor cannot register
 * `sticky`, `canvas`, `kanban`, `attachment`, `page-break` or another
 * `nested-doc`; writing one in empties the whole nested document on the next
 * load. `findUnregisterable` in `containers.ts` refuses those.
 *
 * **A known coarseness in review.** An agent's edit *inside* one of these
 * reviews as a single whole-block hunk rather than per paragraph, because
 * `proposalDiff.ts` keeps its own `childrenOf` and cannot recurse through a
 * container whose own fields changed. Exact in both directions, just coarse —
 * the reason, and what fixing it would take, are in that file's header.
 */
export interface NestedDocBlock {
  type: "nested-doc";
  title: string;
  /** Whether the card shows a preview of its contents. Defaults to open. */
  open?: boolean;
  body?: WritableBlock[];
}

/** The label of a collapsible section — its own block so it can be retitled. */
export interface SummaryBlock extends TextOpacity {
  type: "summary";
  text: string;
}

export interface KanbanTask {
  name: string;
  description?: string;
  /** Lane index, from 0. */
  stage: number;
  priority: "low" | "medium" | "high";
  tags?: string[];
  /** Minted when absent — supply them to keep a rebuild deterministic. */
  id?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface KanbanBlock {
  type: "kanban";
  tasks: KanbanTask[];
}

/**
 * A file attached to the document. Authorable only against a URL that already
 * exists — the bridge cannot upload (plan §9).
 */
/**
 * An image, with its caption as a **field** rather than as nested blocks.
 *
 * `caption` is a whole serialized Lexical editor in storage, and the reason it
 * arrives here as one inline string is docs/plans/archive/haklex-reprise.md
 * §2.4: a caption is content *about* the block, so descending into it would
 * give two addresses for one piece of content. A canvas note, which is a
 * document in its own right, goes the other way and gets addresses.
 *
 * `width`, `height`, `style` and `id` are unmodelled on purpose — carry-through
 * (§4.6.1) preserves them, and an agent has no business choosing an image's
 * pixel width.
 */
export interface ImageBlock {
  type: "image";
  src: string;
  alt: string;
  /** Inline markdown. Absent means the image has no caption. */
  caption?: string;
  /** Whether the caption is shown. Setting `caption` alone does not show it. */
  showCaption?: boolean;
}

export interface AttachmentBlock {
  type: "attachment";
  url: string;
  filename: string;
  mimetype?: string;
  size?: number;
  expanded?: boolean;
}

/** Which edges of the grid a cell is a header for. */
export type CellHeader = "row" | "column" | "both";

/**
 * A cell, as supplied when authoring a table.
 *
 * A bare string is the overwhelmingly common case — 97.4% of the cells in this
 * blog hold exactly one paragraph — so it is the short spelling, and the object
 * form is there for spans and header flags.
 */
type TableCellInput =
  | string
  | {
    text?: string;
    header?: CellHeader;
    colSpan?: number;
    rowSpan?: number;
  };

/**
 * A table.
 *
 * `rows` follows the same rule as `LayoutBlock.columns`: absent on a read
 * because each cell is addressed in its own right, required when inserting a
 * new table, optional when replacing one.
 */
export interface TableBlock {
  type: "table";
  rowCount: number;
  columnCount: number;
  rows?: TableCellInput[][];
  /** Convenience on write: make the first row header cells. */
  headerRow?: boolean;
}

/**
 * One cell. Text-bearing rather than a container, because almost every cell
 * holds a single paragraph and addressing through to it would double the depth
 * of every table in an outline for nothing.
 */
export interface TableCellBlock extends TextOpacity {
  type: "cell";
  text: string;
  header?: CellHeader;
  colSpan?: number;
  rowSpan?: number;
}

/**
 * A block with no codec: readable, addressable, movable, deletable — never
 * rewritten (plan §4.6). `summary` is shape, not content: it says the block is
 * there and roughly what it is, which is weaker than seeing inside it.
 */
export interface OpaqueBlock {
  type: "opaque";
  /** The underlying Lexical node `type`, e.g. `"kanban"`. */
  nodeType: string;
  summary: string;
}

/** A block as it appears in a read. */
export type Block =
  | ParagraphBlock
  | HeadingBlock
  | QuoteBlock
  | ListBlock
  | CodeBlock
  | CodeSnippetBlock
  | DividerBlock
  | LayoutBlock
  | DetailsBlock
  | NestedDocBlock
  | SummaryBlock
  | KanbanBlock
  | AttachmentBlock
  | ImageBlock
  | TableBlock
  | TableCellBlock
  | OpaqueBlock;

/** A block carrying its address, plus any nested blocks. */
export type AddressedBlock = Block & {
  id: Address;
  children?: AddressedBlock[];
};

/** Types a caller may author. `opaque` is readable but never writable. */
export type WritableBlock = Exclude<Block, OpaqueBlock>;

export const isWritableBlock = (block: Block): block is WritableBlock =>
  block.type !== "opaque";
