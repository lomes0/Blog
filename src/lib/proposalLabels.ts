/**
 * How an agent's `origin` string is written for a human.
 *
 * `Revision.origin` and `Document.agentOrigin` are free-form columns the writer
 * chooses — `"claude-code"` today, whatever proposes next tomorrow — so the UI
 * has to render an unrecognised value rather than fall through to nothing. The
 * fallback is the raw string, not "Unknown": knowing *which* agent wrote is the
 * whole content of the field, and a value nobody has a label for is still more
 * informative than a shrug.
 */
const KNOWN_ORIGINS: Record<string, string> = {
  "claude-code": "Claude Code",
};

export function originLabel(origin: string | null | undefined): string {
  if (!origin) return "Agent";
  return KNOWN_ORIGINS[origin] ?? origin;
}
