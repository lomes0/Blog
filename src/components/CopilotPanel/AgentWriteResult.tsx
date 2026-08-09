"use client";
import type { ToolUIPart } from "ai";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Typography,
} from "@mui/material";
import { GitPullRequest, GitPullRequestCreate } from "lucide-react";
import { postsSelectors, useSelector } from "@/store";
import { documentCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";
import { useProposalActions } from "@/hooks/useProposalActions";
import { describePendingToolCall } from "@/lib/ai/copilotAgentTools";
import {
  type AgentWriteOutcome,
  asAgentWriteOutcome,
} from "@/editor/utils/copilotAgentExecutors";
import { ICON_SIZE } from "@/theme/icons";

interface AgentWriteResultProps {
  /** `apply_ops` or `create_post` — the two content writes. */
  toolName: string;
  /**
   * The call's arguments, so the in-flight line can say *what* is being
   * written rather than only that something is. The tool answers that itself
   * (`describePendingToolCall`); this component does not read the shape.
   */
  input?: unknown;
  /**
   * The tool part's state, which is also this component's loading flag. Taken
   * from the SDK's own union rather than restated: it is an open enum, and a
   * state added by a version bump must not silently fail to render.
   */
  state: ToolUIPart["state"];
  /** The executor's return value, once there is one. */
  output?: unknown;
  /** Set when the part failed outright rather than returning a refusal. */
  errorText?: string;
}

/**
 * What a content write did, in the transcript (§4.4.5).
 *
 * The write itself is already done by the time this renders: since
 * docs/plans/ai-surface-consolidation.md §4.4 the agent proposes on the tool
 * call, so there is no Accept here and this is a report rather than a decision.
 * The one action it offers is **Review**, which is `useProposalActions.review` —
 * the same call the rail and `AgentChangeBar` make, opening the document, naming
 * the diff revisions and opening the diff in one go.
 *
 * `ActionPreview`'s per-op listing is deliberately not used for these any more:
 * the diff is a better answer to "what changed" than a rendering of the ops, and
 * the ops are no longer a thing the user is being asked to approve sight-unseen.
 * It keeps rendering *command* proposals, which have no diff to offer.
 *
 * Three refusals have to stay distinguishable, because they ask for different
 * things from the user:
 *
 * - **stale** — the state moved between the agent's read and its write, so the
 *   addresses no longer point where they did. Nothing was written; asking again
 *   works, because the agent re-reads.
 * - **replaced** (on a *success*) — an earlier proposal had gone out of date
 *   because the author saved after it was written, so this batch started over
 *   and that earlier work is gone. This is `selectAgentRead`'s `staleProposal`,
 *   and it is a different event from the one above.
 * - **invalid / not-found / denied** — the request was wrong when it was made
 *   and retrying it unchanged fails identically.
 */
export default function AgentWriteResult(
  { toolName, input, state, output, errorText }: AgentWriteResultProps,
) {
  const run = useCommandRun();
  const { review } = useProposalActions();
  const outcome = state === "output-available"
    ? asAgentWriteOutcome(output)
    : null;
  const documentId = outcome?.ok ? outcome.documentId : null;
  // The listed row is preferred over the one the write reported, because it
  // carries the document's *current* head — the left-hand side of the review
  // diff. `runWriteTool` refreshes the listing, so this is normally present; the
  // fallback keeps Review working in the window before it lands.
  const listed = useSelector((appState) =>
    documentId ? appState.ui.proposals.byDocId[documentId] : undefined
  );
  const head = useSelector((appState) =>
    documentId ? postsSelectors.selectById(appState, documentId)?.head : null
  );

  // Loading (DESIGN.md §9), and the default for every state that is not yet a
  // result: the write is a round trip, and on a long document the model's own
  // pause before it is longer still, so this is a state the user really sees
  // rather than a formality.
  if (state !== "output-available" && state !== "output-error") {
    return (
      <Row>
        <CircularProgress size={ICON_SIZE.inline} />
        <Typography variant="dense" color="text.secondary">
          {describePendingToolCall(toolName, input)}
        </Typography>
      </Row>
    );
  }

  if (state === "output-error" || !outcome) {
    return (
      <Alert severity="error" variant="outlined" sx={alertSx}>
        {errorText || "That change could not be written."}
      </Alert>
    );
  }

  if (!outcome.ok) {
    return (
      <Alert
        severity={outcome.reason === "stale" ? "warning" : "error"}
        variant="outlined"
        sx={alertSx}
      >
        {refusalText(outcome)}
      </Alert>
    );
  }

  if (outcome.kind === "created") {
    return (
      <Box>
        <Row>
          <Box sx={{ color: "text.secondary", display: "flex" }}>
            <GitPullRequestCreate size={ICON_SIZE.inline} />
          </Box>
          <Typography variant="dense" sx={{ fontWeight: 600 }}>
            Created “{outcome.title}”
          </Typography>
          <Button
            size="small"
            variant="text"
            sx={actionSx}
            onClick={() =>
              void run(documentCommands.open, {
                id: outcome.documentId,
                mode: "write",
              })}
          >
            Open
          </Button>
        </Row>
        <Typography variant="micro" component="div" color="text.secondary">
          A new draft, not published — keep or discard it on the post itself.
        </Typography>
      </Box>
    );
  }

  const edits = `${outcome.changed} edit${outcome.changed === 1 ? "" : "s"}`;
  const proposal = listed ?? {
    id: outcome.proposalId,
    documentId: outcome.documentId,
    head: head ?? null,
  };

  return (
    <Box>
      <Row>
        <Box sx={{ color: "text.secondary", display: "flex" }}>
          <GitPullRequest size={ICON_SIZE.inline} />
        </Box>
        <Typography variant="dense" sx={{ fontWeight: 600 }}>
          {outcome.outcome === "squashed"
            ? `Added ${edits} to the pending change for “${outcome.title}”`
            : `Proposed ${edits} to “${outcome.title}”`}
        </Typography>
        <Button
          size="small"
          variant="text"
          sx={actionSx}
          onClick={() => void review(proposal)}
        >
          Review
        </Button>
      </Row>
      <Typography variant="micro" component="div" color="text.secondary">
        Nothing is live yet — approve it on the post to apply it.
      </Typography>
      {outcome.outcome === "replaced" && (
        <Typography variant="micro" component="div" color="warning.main">
          Your earlier pending change was out of date — you saved after it was
          written — so this replaced it rather than adding to it.
        </Typography>
      )}
    </Box>
  );
}

function refusalText(
  outcome: Extract<AgentWriteOutcome, { ok: false }>,
): string {
  switch (outcome.reason) {
    case "stale":
      return "The post changed while this edit was being written, so nothing " +
        "was saved. Ask again and Copilot will re-read the current content.";
    case "not-found":
      return "That post could not be found, so nothing was written.";
    case "denied":
      return "You do not have permission to edit that post, so nothing was " +
        "written.";
    default:
      return `That edit could not be applied: ${outcome.message}`;
  }
}

/** The one-line header both success states share. */
function Row({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 0.75,
      }}
    >
      {children}
    </Box>
  );
}

const actionSx = { py: 0, px: 0.75, minWidth: 0, typography: "micro" } as const;

const alertSx = { py: 0, typography: "micro", alignItems: "center" } as const;
