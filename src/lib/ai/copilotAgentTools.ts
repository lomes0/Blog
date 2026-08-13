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
 * docs/plans/archive/ai-surface-consolidation.md §4.2; the `post` vocabulary won because
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

// ─── Labels ──────────────────────────────────────────────────────────────────

/**
 * Each tool says what it did, rather than the UI guessing from the first
 * argument (docs/plans/archive/haklex-adoption.md §7.3).
 *
 * This lives beside the name lists, not in the chat, for the same reason the
 * lists do: it is the one module both the server route and the browser import,
 * so a tool cannot be described one way in the transcript and another anywhere
 * else. The `satisfies Record<AgentToolName, …>` below is what makes that
 * total — a name added to READ_TOOLS or WRITE_TOOLS with no describer does not
 * compile, so the label can never quietly fall back to the wire name for a
 * tool this build actually has.
 *
 * There is no MCP half to this. Claude Code renders a tool call from its own
 * side and the SDK's `registerTool` carries no label field, so `mcp/server.ts`
 * has nowhere to put one; §7.3's mention of it does not apply.
 */
type ToolInput = Record<string, unknown>;

const str = (value: unknown): string => typeof value === "string" ? value : "";

const count = (n: number, noun: string): string =>
  `${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * Up to `limit` block addresses an op batch names, as a phrase.
 *
 * `insert_blocks` names no block of its own, so it is described by the anchor
 * it lands against — which is the address the author would look for.
 */
const opTargets = (input: ToolInput, limit = 2): string => {
  const ops = Array.isArray(input.ops) ? input.ops : [];
  const seen: string[] = [];
  for (const op of ops) {
    if (typeof op !== "object" || op === null) continue;
    const o = op as ToolInput;
    const target = str(o.id) || str(o.after) || str(o.before) ||
      str(o.appendTo);
    if (target && !seen.includes(target)) seen.push(target);
  }
  if (seen.length === 0) return "";
  const shown = seen.slice(0, limit);
  const rest = seen.length - shown.length;
  const list = shown.length === 2 ? `${shown[0]} and ${shown[1]}` : shown[0];
  return rest > 0
    ? ` to ${shown.join(", ")} and ${rest} other${rest === 1 ? "" : "s"}`
    : ` to ${list}`;
};

const opCount = (input: ToolInput): number =>
  Array.isArray(input.ops) ? input.ops.length : 0;

/**
 * Completed-tense label per tool. Keyed by name so the Record is exhaustive;
 * see the note above.
 */
const DESCRIBERS = {
  list_posts: () => "Listed all posts",
  list_series: () => "Listed all series",
  search: (input) => `Searched “${str(input.query)}”`,
  outline: (input) =>
    input.id ? `Outlined ${str(input.id)}` : "Outlined this document",
  read_blocks: (input) =>
    `Read ${
      count(Array.isArray(input.blocks) ? input.blocks.length : 0, "block")
    }`,
  read_post: (input) =>
    input.id ? `Read ${str(input.id)}` : "Read this document",
  get_selection: () => "Read the selection",
  apply_ops: (input) =>
    `Proposed ${count(opCount(input), "edit")}${opTargets(input)}`,
  create_post: (input) =>
    input.title ? `Created “${str(input.title)}”` : "Created a draft",
} satisfies Record<AgentToolName, (input: ToolInput) => string>;

/** In-flight variants, for the two writes — the only calls with a visible wait. */
const PENDING_DESCRIBERS = {
  apply_ops: (input) =>
    `Proposing ${count(opCount(input), "edit")}${opTargets(input)}…`,
  create_post: (input) =>
    input.title ? `Creating “${str(input.title)}”…` : "Creating a draft…",
} satisfies Record<WriteToolName, (input: ToolInput) => string>;

const lookup = (
  table: Record<string, (input: ToolInput) => string>,
  name: string,
): ((input: ToolInput) => string) | undefined => table[name];

/**
 * What a finished tool call did, in one line.
 *
 * An unrecognized name — a thread persisted before the §4.2 rename replays
 * `read_document` and friends — keeps its wire name with the underscores
 * knocked out. Not a label anyone wrote, but honest and never blank.
 */
export const describeToolCall = (name: string, input?: unknown): string => {
  const args = (input ?? {}) as ToolInput;
  const describe = lookup(DESCRIBERS, name);
  return describe ? describe(args) : name.replace(/_/g, " ");
};

/** The same, while the call is still running. */
export const describePendingToolCall = (
  name: string,
  input?: unknown,
): string => {
  const args = (input ?? {}) as ToolInput;
  const describe = lookup(PENDING_DESCRIBERS, name);
  return describe ? describe(args) : describeToolCall(name, args);
};
