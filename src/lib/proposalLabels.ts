/**
 * How an agent's `origin` string is written, and read back for a human.
 *
 * `Revision.origin` and `Document.agentOrigin` are free-form columns the writer
 * chooses — `"claude-code"` today, whatever proposes next tomorrow — so the UI
 * has to render an unrecognised value rather than fall through to nothing. The
 * fallback is the raw string, not "Unknown": knowing *which* agent wrote is the
 * whole content of the field, and a value nobody has a label for is still more
 * informative than a shrug.
 *
 * Since docs/plans/archive/mcp-support.md phase 5 an origin may also name the *instance*
 * that wrote, as `agent:instance` — the remote MCP endpoint stamps the agent
 * token's name, so the rail can say which machine proposed rather than only
 * that something did. Composing and parsing that form both live here so the
 * format has one definition.
 */
const KNOWN_ORIGINS: Record<string, string> = {
  "claude-code": "Claude Code",
  // The in-app agent, since docs/plans/archive/ai-surface-consolidation.md §4.4: its
  // content writes are proposals in this table too, so the rail now has a second
  // origin to name. Server-stamped by `POST /api/documents/[id]/proposals`.
  copilot: "Copilot",
};

/** Longest instance suffix kept. Token names are free-form and user-supplied. */
const MAX_INSTANCE = 32;

/**
 * `agent` alone, or `agent:instance` when there is something to name.
 *
 * The instance is sanitised rather than rejected: this runs on a write path,
 * and refusing a proposal because someone called their token `a:b` would be a
 * worse outcome than storing `a-b`. `:` is the separator, so it cannot survive
 * inside either half.
 */
export function agentOrigin(agent: string, instance?: string | null): string {
  const clean = instance
    ?.replace(/[:\s]+/g, "-")
    .replace(/[^\w.-]/g, "")
    .slice(0, MAX_INSTANCE);
  return clean ? `${agent}:${clean}` : agent;
}

export function originLabel(origin: string | null | undefined): string {
  if (!origin) return "Agent";
  const at = origin.indexOf(":");
  if (at === -1) return KNOWN_ORIGINS[origin] ?? origin;

  // Unknown agents keep their raw name here too, for the reason in the header:
  // the field's whole content is which writer it was.
  const agent = origin.slice(0, at);
  const instance = origin.slice(at + 1);
  const label = KNOWN_ORIGINS[agent] ?? agent;
  return instance ? `${label} (${instance})` : label;
}
