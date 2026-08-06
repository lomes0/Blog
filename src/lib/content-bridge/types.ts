/**
 * Shared shapes for the content bridge (docs/plans/claude-code-lexical.md).
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

export interface ListItem {
  text: string;
  /** Present only for checklists. */
  checked?: boolean;
  indent: number;
}

export interface ListBlock extends TextOpacity {
  type: "list";
  listType: "bullet" | "number" | "check";
  items: ListItem[];
}

export interface CodeBlock {
  type: "code";
  language: string;
  code: string;
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
