/**
 * The content bridge — Claude Code and the in-app Copilot address a Lexical
 * document by block instead of round-tripping it through Markdown.
 *
 * See docs/plans/archive/claude-code-lexical.md. The load-bearing property is §4.1:
 * losslessness comes from *addressing*, not from format coverage. The applier
 * touches only the nodes an op names, so a kanban board nobody mentioned comes
 * out identical, and the IR never has to be able to express one.
 *
 * Phase 1 (this module) is pure logic over serialized JSON — no DOM, no
 * `@lexical/headless`, no node classes — so it runs identically in the browser
 * and in the MCP server, and is testable without mounting anything.
 */
export {
  BLOCK_CONTAINERS,
  formatAddress,
  locate,
  parseAddress,
  pathOf,
  walkBlocks,
} from "./address";
export { blockIdState, isBlockId, mintBlockId, readBlockId } from "./blockId";
export {
  blockText,
  blockToNode,
  canSetText,
  describeNode,
  isTextEditable,
  nodeToBlock,
  TEXT_BLOCKS,
} from "./blocks";
export { normalizeInline, parseInline, renderInline } from "./inline";
export {
  applyOps,
  emptyState,
  OpError,
  stampBlockIds,
  stateFromBlocks,
} from "./ops";
export type { ApplyResult, InsertTarget, Op, OpErrorCode } from "./ops";
export {
  blockPreview,
  formatOutline,
  outline,
  readAll,
  readBlocks,
} from "./outline";
export type { BlocksRead, Outline, OutlineEntry } from "./outline";
export {
  deletedNodes,
  describeRemovals,
  describeRemovedBlock,
  removalOf,
  withRemovalNote,
} from "./removals";
export type { Removal } from "./removals";
export { assertFresh, StaleStateError, stateHash } from "./stateHash";
export type {
  Address,
  AddressedBlock,
  AttachmentBlock,
  Block,
  CodeBlock,
  DetailsBlock,
  DividerBlock,
  HeadingBlock,
  KanbanBlock,
  KanbanTask,
  LayoutBlock,
  ListBlock,
  ListItem,
  OpaqueBlock,
  ParagraphBlock,
  QuoteBlock,
  SerializedNode,
  StoredState,
  SummaryBlock,
  WritableBlock,
} from "./types";
export { isWritableBlock } from "./types";
