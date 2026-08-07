"use client";
import { Box, type SxProps, type Theme, Tooltip } from "@mui/material";
import { AlertTriangle, FilePlus2, GitPullRequest } from "lucide-react";
import type { AgentMarker as AgentMarkerValue } from "@/store/selectors/proposalSelectors";
import { ICON_SIZE } from "@/theme/icons";

interface AgentMarkerProps {
  /** The marker value; null means no marker is rendered. */
  marker: AgentMarkerValue | null;
  /**
   * Optional count of agent-marked documents inside this container.
   * When provided, the tooltip says "N agent changes inside" instead of the
   * single-document label.
   */
  count?: number;
  /**
   * Icon size override. Defaults to `ICON_SIZE.micro` (12px) to match the
   * existing badge slot on tree rows; a collapsed rail may want a different size.
   */
  size?: number;
  /**
   * Where the marker sits, which is the caller's business and not this
   * component's: a post row pushes it to the far edge with `ml: "auto"`, a group
   * row shares that edge with a count pill, and the collapsed rail overlays it
   * on an icon. Only the vocabulary — glyph, colour, label — is fixed here.
   */
  sx?: SxProps<Theme>;
}

/**
 * Renders the agent-change marker for a document or group row.
 *
 * The vocabulary is from docs/plans/agent-change-indication.md §2. A glyph per
 * state rather than a colour per state, because DESIGN.md §10 forbids carrying
 * state in colour alone — and this marker has to survive a monochrome scan of a
 * dense tree.
 *
 * Reused by post rows, group rows (series/project), and the collapsed sidebar.
 */
export function AgentMarker({
  marker,
  count,
  size = ICON_SIZE.micro,
  sx,
}: AgentMarkerProps) {
  if (!marker) return null;

  const labels = {
    pending: "Agent change waiting for review",
    stale: "Agent change is out of date — reject or re-run",
    created: "Created by an agent, not yet accepted",
  } as const;

  // For group rows with a count, replace the label with "N agent changes inside".
  const label = count !== undefined && count > 1
    ? `${count} agent changes inside`
    : labels[marker];

  const glyphs = {
    pending: GitPullRequest,
    stale: AlertTriangle,
    created: FilePlus2,
  } as const;

  const colors = {
    pending: "primary.main",
    stale: "warning.main",
    created: "primary.main",
  } as const;

  const Icon = glyphs[marker];

  // The tooltip is non-interactive for the reason `RowAgentActions` gives at
  // length: an interactive popper is portaled out of the row, so the pointer
  // entering it drops the `:hover` that decides what the row is showing.

  return (
    <Tooltip title={label} placement="right" disableInteractive>
      <Box
        component="span"
        role="img"
        aria-label={label}
        sx={{
          display: "flex",
          flexShrink: 0,
          color: colors[marker],
          ...sx,
        }}
      >
        {/* A glyph per state: DESIGN.md §10 — state is never carried by colour alone. */}
        <Icon size={size} />
      </Box>
    </Tooltip>
  );
}
