"use client";
import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { getToolName, isTextUIPart, isToolUIPart } from "ai";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { Check, Copy, RefreshCw, Search } from "lucide-react";
import { applyProposal } from "@/editor/utils/copilotAgentExecutors";
import {
  commandForTool,
  isProposalCommandTool,
  previewCommandTool,
  toolDisposition,
} from "@/lib/ai/commandTools";
import { useCommandContext } from "@/commands/CommandProvider";
import ActionPreview from "./ActionPreview";
import AgentWriteResult from "./AgentWriteResult";
import MarkdownText from "./MarkdownText";
import { ICON_SIZE } from "@/theme/icons";

type AddToolOutput = (
  args: { tool: string; toolCallId: string; output: unknown },
) => Promise<void>;

interface CopilotMessageProps {
  message: UIMessage;
  addToolOutput: AddToolOutput;
  /** Provided only for the latest assistant message; enables regenerate. */
  onRegenerate?: () => void;
}

const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

/** One-line label for an auto-executed tool, for the activity trace. */
function readTraceLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "list_posts":
      return "Listed all posts";
    case "list_series":
      return "Listed all series";
    case "search":
      return `Searched “${asStr(input.query)}”`;
    case "outline":
      return input.id
        ? `Outlined ${asStr(input.id)}`
        : "Outlined this document";
    case "read_blocks": {
      const blocks = Array.isArray(input.blocks) ? input.blocks : [];
      return `Read ${blocks.length} block${blocks.length === 1 ? "" : "s"}`;
    }
    case "read_post":
      return input.id ? `Read ${asStr(input.id)}` : "Read this document";
    case "get_selection":
      return "Read the selection";
    default:
      // A command tool: its own title reads better than its wire name, and
      // there is nothing to hand-maintain here as commands are added.
      //
      // Also the landing place for a tool this build no longer has — a thread
      // persisted before the §4.2 rename replays `read_document` and friends.
      // The wire name with its underscores knocked out is not a label anyone
      // wrote, but it is honest and it is not blank.
      return commandForTool(name)?.title ?? name.replace(/_/g, " ");
  }
}

const CopilotMessage: React.FC<CopilotMessageProps> = (
  { message, addToolOutput, onRegenerate },
) => {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const commandContext = useCommandContext();
  const commandContextRef = useRef(commandContext);
  commandContextRef.current = commandContext;

  const textParts = message.parts.filter(isTextUIPart);
  const toolParts = message.parts.filter(isToolUIPart);

  // Three families, not two, since §4.4 (see `toolDisposition`): reads are a
  // muted trace, content writes report what they proposed and offer Review, and
  // only mutating commands are still held here for an Accept. A tool this build
  // no longer has — a thread persisted before the §4.2 rename — traces with the
  // rest rather than blanking or offering an Accept nothing can honour.
  const readParts = toolParts.filter((p) => {
    const disposition = toolDisposition(getToolName(p));
    return disposition === "read" || disposition === "unknown";
  });
  const contentWriteParts = toolParts.filter(
    (p) => toolDisposition(getToolName(p)) === "write",
  );
  const proposalParts = toolParts.filter(
    (p) => toolDisposition(getToolName(p)) === "proposal",
  );
  const pendingParts = proposalParts.filter(
    (p) => p.state === "input-available",
  );
  const appliedParts = proposalParts.filter(
    (p) => p.state === "output-available",
  );

  const textContent = textParts.map((p) => p.text).join("");

  // A command proposal has nothing to render from its raw arguments — an id and
  // a new title say nothing about what is being replaced. `preview()` is the
  // command's own answer to "what would accepting do", resolved here because it
  // is async and `ActionPreview` is a pure switch.
  //
  // Keyed on a serialization of the pending calls rather than the parts array,
  // so this re-runs when the proposals actually change and not on every render.
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const proposalKey = JSON.stringify(
    pendingParts
      .filter((p) => isProposalCommandTool(getToolName(p)))
      .map((p) => ({
        id: p.toolCallId,
        name: getToolName(p),
        input: (p as { input?: unknown }).input ?? {},
      })),
  );

  useEffect(() => {
    const proposals = JSON.parse(proposalKey) as {
      id: string;
      name: string;
      input: unknown;
    }[];
    if (proposals.length === 0) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const proposal of proposals) {
        try {
          const change = await previewCommandTool(
            proposal.name,
            proposal.input,
            commandContextRef.current,
          );
          if (change) next[proposal.id] = change.summary;
        } catch (error) {
          // A preview that cannot be produced falls back to the command's
          // title, which is still an honest description of the action.
          console.error("[copilot] preview failed", error);
        }
      }
      if (!cancelled) setSummaries(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [proposalKey]);

  const handleAccept = async () => {
    for (const part of pendingParts) {
      const result = await applyProposal(
        getToolName(part),
        ((part as { input?: unknown }).input ?? {}) as Record<string, unknown>,
        commandContextRef.current,
      );
      await addToolOutput({
        tool: getToolName(part),
        toolCallId: part.toolCallId,
        output: result,
      });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDiscard = async () => {
    type ErrorOutput = (
      args: {
        tool: string;
        toolCallId: string;
        state: "output-error";
        errorText: string;
      },
    ) => Promise<void>;
    for (const part of pendingParts) {
      await (addToolOutput as unknown as ErrorOutput)({
        tool: getToolName(part),
        toolCallId: part.toolCallId,
        state: "output-error",
        errorText: "User cancelled",
      });
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
      }}
    >
      {/* Agent activity trace (read tools) */}
      {!isUser && readParts.length > 0 && (
        <Box
          sx={{ mb: textContent || pendingParts.length ? 0.75 : 0, ml: 0.5 }}
        >
          {readParts.map((p) => (
            <Box
              key={p.toolCallId}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                color: "text.secondary",
              }}
            >
              <Search size={ICON_SIZE.inline} style={{ flexShrink: 0 }} />
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {readTraceLabel(
                  getToolName(p),
                  ((p as { input?: unknown }).input ?? {}) as Record<
                    string,
                    unknown
                  >,
                )}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {(textContent || pendingParts.length > 0 || appliedParts.length > 0 ||
        contentWriteParts.length > 0) && (
        <Box
          sx={{
            maxWidth: "85%",
            px: 1.5,
            py: 1,
            borderRadius: 2,
            bgcolor: isUser ? "primary.main" : "action.hover",
            color: isUser ? "primary.contrastText" : "text.primary",
          }}
        >
          {textContent && (
            isUser
              ? (
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {textContent}
                </Typography>
              )
              : <MarkdownText>{textContent}</MarkdownText>
          )}

          {
            /* Content writes: already proposed, so this reports and offers
              Review rather than asking for anything (§4.4.5). */
          }
          {contentWriteParts.length > 0 && (
            <Box
              sx={{
                mt: textContent ? 1 : 0,
                p: 1,
                display: "flex",
                flexDirection: "column",
                gap: 1,
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                bgcolor: "background.paper",
              }}
            >
              {contentWriteParts.map((p) => (
                <AgentWriteResult
                  key={p.toolCallId}
                  toolName={getToolName(p)}
                  state={p.state}
                  output={(p as { output?: unknown }).output}
                  errorText={(p as { errorText?: string }).errorText}
                />
              ))}
            </Box>
          )}

          {pendingParts.length > 0 && (
            <Box
              sx={{
                mt: textContent ? 1 : 0,
                p: 1,
                border: 1,
                borderColor: isUser ? "primary.light" : "divider",
                borderRadius: 1,
                bgcolor: isUser ? "primary.dark" : "background.paper",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  mb: 1,
                }}
              >
                {pendingParts.map((p) => (
                  <ActionPreview
                    key={p.toolCallId}
                    type={getToolName(p)}
                    input={((p as { input?: unknown }).input ?? {}) as Record<
                      string,
                      unknown
                    >}
                    summary={summaries[p.toolCallId]}
                    onColoredBg={isUser}
                  />
                ))}
              </Box>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<Check size={ICON_SIZE.inline} />}
                  onClick={handleAccept}
                  sx={{ py: 0.25 }}
                >
                  Accept
                </Button>
                <Button
                  size="small"
                  variant="text"
                  color="error"
                  onClick={handleDiscard}
                  sx={{ py: 0.25 }}
                >
                  Discard
                </Button>
              </Box>
            </Box>
          )}

          {pendingParts.length === 0 && appliedParts.length > 0 && (
            <Chip
              size="small"
              icon={<Check size={ICON_SIZE.micro} />}
              label="Applied"
              color="success"
              variant="outlined"
              sx={{ mt: 0.5, height: 20, typography: "micro" }}
            />
          )}
        </Box>
      )}

      {!isUser && (textContent || onRegenerate) && (
        <Box sx={{ display: "flex", gap: 0.25, mt: 0.25, ml: 0.5 }}>
          {textContent && (
            <Tooltip title={copied ? "Copied" : "Copy"}>
              <IconButton
                size="small"
                onClick={handleCopy}
                aria-label="Copy message"
                sx={{ color: "text.secondary", p: 0.5 }}
              >
                {copied
                  ? <Check size={ICON_SIZE.inline} />
                  : <Copy size={ICON_SIZE.inline} />}
              </IconButton>
            </Tooltip>
          )}
          {onRegenerate && (
            <Tooltip title="Regenerate">
              <IconButton
                size="small"
                onClick={onRegenerate}
                aria-label="Regenerate response"
                sx={{ color: "text.secondary", p: 0.5 }}
              >
                <RefreshCw size={ICON_SIZE.inline} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
    </Box>
  );
};

export default CopilotMessage;
