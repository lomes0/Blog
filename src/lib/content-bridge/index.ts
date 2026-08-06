/**
 * The content bridge — Claude Code and the in-app Copilot address a Lexical
 * document by block instead of round-tripping it through Markdown.
 *
 * See docs/plans/claude-code-lexical.md. The load-bearing property is §4.1:
 * losslessness comes from *addressing*, not from format coverage. The applier
 * touches only the nodes an op names, so a kanban board nobody mentioned comes
 * out identical, and the IR never has to be able to express one.
 *
 * Phase 1 (this module) is pure logic over serialized JSON — no DOM, no
 * `@lexical/headless`, no node classes — so it runs identically in the browser
 * and in the MCP server, and is testable without mounting anything.
 */
export { formatAddress, parseAddress, locate, walkBlocks } from "./address";
export { describeNode, isTextEditable, nodeToBlock, blockToNode } from "./blocks";
export { normalizeInline, parseInline, renderInline } from "./inline";
export { applyOps, emptyState, OpError, stateFromBlocks } from "./ops";
export type { ApplyResult, InsertTarget, Op } from "./ops";
export { formatOutline, outline, readAll, readBlocks } from "./outline";
export type { BlocksRead, Outline, OutlineEntry } from "./outline";
export { assertFresh, StaleStateError, stateHash } from "./stateHash";
export type {
  Address,
  AddressedBlock,
  Block,
  CodeBlock,
  HeadingBlock,
  ListBlock,
  ListItem,
  OpaqueBlock,
  ParagraphBlock,
  QuoteBlock,
  SerializedNode,
  StoredState,
  WritableBlock,
} from "./types";
export { isWritableBlock } from "./types";
