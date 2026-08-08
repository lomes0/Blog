/**
 * Shared metadata for the Copilot content-agent tools.
 *
 * The tools are *declared* on the server route (schemas only, no `execute`) and
 * *executed on the client* — that's the only place all content (local IndexedDB
 * + cloud) and the live editor are available. This module is the single source
 * of truth both sides agree on for which tools are read-only (auto-executed so
 * the agent loop keeps flowing) vs. writes (surfaced as reviewable proposals the
 * user accepts before anything is saved). It is dependency-free so both the
 * server route and the browser can import it.
 *
 * The names are deliberately the same ones `mcp/content-server.ts` exposes to
 * Claude Code — one operation, one name, whichever agent is calling. See
 * docs/plans/ai-surface-consolidation.md §4.2; the `post` vocabulary won because
 * "document" is the Prisma row and "post" is what the author calls it. A
 * persisted thread from before that rename holds the old names; the chat renders
 * an unrecognized tool from its wire name rather than blanking.
 */

/**
 * Read-only tools: executed automatically client-side, results fed back.
 *
 * `id` is optional on the three document readers — omitted, they act on the
 * document currently open in the editor, including its unsaved edits. That
 * collapses what used to be a separate `read_current_document` into a
 * parameter, so there is one less tool whose only difference is its subject.
 */
export const READ_TOOLS = [
  "list_posts",
  "list_series",
  "search",
  "outline",
  "read_blocks",
  "read_post",
  "get_selection",
] as const;

/**
 * Write tools: executed on arrival, like a read — but they change stored state.
 *
 * They are **not** chat proposals any more (docs/plans/
 * ai-surface-consolidation.md §4.4). The call goes straight to
 * `POST /api/documents/[id]/proposals`, which stores it as a pending proposal
 * exactly as Claude Code's does; the author's one decision is in
 * `AgentChangeBar` or the review rail, not in the transcript. So "write" here
 * describes what the tool *does*, and no longer where the user answers it — see
 * `toolDisposition` in `commandTools.ts` for the three-way split every UI reader
 * asks.
 *
 * `edit_document` and `write_document` are gone. Both worked by rewriting a
 * document's entire body from Markdown; `apply_ops` names the blocks it
 * changes and leaves everything else untouched.
 */
export const WRITE_TOOLS = [
  "apply_ops",
  "create_post",
] as const;

export type ReadToolName = (typeof READ_TOOLS)[number];
export type WriteToolName = (typeof WRITE_TOOLS)[number];
export type AgentToolName = ReadToolName | WriteToolName;

const READ_SET = new Set<string>(READ_TOOLS);
const WRITE_SET = new Set<string>(WRITE_TOOLS);

export const isReadTool = (name: string): name is ReadToolName =>
  READ_SET.has(name);
export const isWriteTool = (name: string): name is WriteToolName =>
  WRITE_SET.has(name);
export const isAgentTool = (name: string): name is AgentToolName =>
  READ_SET.has(name) || WRITE_SET.has(name);
