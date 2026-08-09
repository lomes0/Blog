/**
 * What the Copilot tells the model about the user's selection.
 *
 * Declared here rather than beside the capture because three places have to
 * agree on the shape and only one of them can import the editor: the capture
 * itself (`@/editor/utils/captureSelection`, browser-only), the request schema
 * in `src/app/api/copilot/route.ts`, and the prompt section in `./prompts`.
 * A type in this module is the seam — no zod, no Lexical, importable from
 * either side.
 *
 * ### Why addresses rather than text
 *
 * haklex's `captureSelection.ts` inlines the containing blocks' content into
 * the prompt, because their agent has no read tool to call mid-loop. Ours does.
 * So this carries *addresses* — the same `blk_…` ids and `b4.2` paths every
 * read and write tool already takes — and the prompt tells the model to
 * `read_blocks` them. The payload stays small, and block text reaches the model
 * in one spelling (the bridge's) instead of two.
 *
 * See docs/plans/haklex-adoption.md §7.3.
 */

/** One end of a text selection. */
export interface SelectionPoint {
  /**
   * The addressable block holding this end — a persistent `blk_…` id when the
   * block has one, otherwise its structural path (`b4`, `b4.2`). Both are
   * addresses `read_blocks` and `apply_ops` already accept.
   */
  id: string;
  /**
   * Character offset within that block's *plain* text.
   *
   * Plain, not the inline-Markdown a read returns: an emphasized run is two
   * characters shorter here than in `read_blocks` output. The offsets locate
   * the range; the block content still has to be read.
   */
  offset: number;
}

/**
 * `truncated` means the payload was capped — the text, the id list, or both.
 * The addresses are still exact; only the listing is short.
 */
export type CapturedSelection =
  | {
    kind: "blocks";
    /** The selected blocks, in document order. */
    ids: string[];
    truncated?: boolean;
  }
  | {
    kind: "text";
    /** The exact selected text, capped at `MAX_SELECTION_TEXT`. */
    text: string;
    anchor: SelectionPoint;
    focus: SelectionPoint;
    /** Every block the range touches, in document order. */
    ids: string[];
    truncated?: boolean;
  };

/**
 * Caps. A selection is context, not content: the model is told where the range
 * is and reads the blocks itself, so neither of these has to be generous.
 */
export const MAX_SELECTION_TEXT = 2000;
export const MAX_SELECTION_BLOCKS = 50;

/** Longest address the schema will accept — ids are short by construction. */
export const MAX_ADDRESS_LENGTH = 64;
