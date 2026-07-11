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
 */

/** Read-only tools: executed automatically client-side, results fed back. */
export const READ_TOOLS = [
  "list_documents",
  "search_documents",
  "read_document",
  "read_current_document",
  "get_selection",
] as const;

/** Write tools: surfaced as proposals; applied only on user accept. */
export const WRITE_TOOLS = [
  "edit_document",
  "write_document",
  "create_document",
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
