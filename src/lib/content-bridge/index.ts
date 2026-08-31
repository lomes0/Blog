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
 *
 * **This is a convenience aggregate, not a declared API surface.** Consumers
 * import deep paths (`content-bridge/types`, `/ops`, `/schema`, `/address`, …)
 * about as often as they import this file, and `schema.ts` is deliberately kept
 * out of it (see `agentWrites.ts`). So it re-exports what is actually imported
 * *through* it and nothing else — a name nobody takes from here is rot, not
 * API, and adding one back is free the moment something wants it. It used to
 * publish 43 names no importer named, which is what made `knip`'s report on
 * this directory unreadable.
 */
export { BLOCK_CONTAINERS, formatAddress, walkBlocks } from "./address";
export { blockIdState } from "./blockId";
export { blockText, nodeToBlock } from "./blocks";
export { applyOps, emptyState, OpError, stateFromBlocks } from "./ops";
export type { ApplyResult, Op, OpErrorCode } from "./ops";
export { formatOutline, outline, readAll, readBlocks } from "./outline";
export { deletedNodes, describeRemovals, withRemovalNote } from "./removals";
export { StaleStateError, stateHash } from "./stateHash";
export type { StoredState, WritableBlock } from "./types";
