"use client";
import { useContext, useEffect, useRef, useState } from "react";
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
import { ActiveEditorContext } from "@/contexts/ActiveEditorContext";
import { applyProposal } from "@/editor/utils/copilotAgentExecutors";
import {
  commandForTool,
  isAutoRunTool,
  isProposalCommandTool,
  previewCommandTool,
} from "@/lib/ai/commandTools";
import { useCommandContext } from "@/commands/CommandProvider";
import ActionPreview from "./ActionPreview";
import MarkdownText from "./MarkdownText";
import { ICON_SIZE } from "@/theme/icons";

type AddToolOutput = (
  args: { tool: string; toolCallId: string; output: unknown },
) => Promise<void>;

interface CopilotMessageProps {
  message: UIMessage;
  addToolOutput: AddToolOutput;
  /** Id of the open document — writes to it apply through the live editor. */
  currentDocId: string;
  /** Provided only for the latest assistant message; enables regenerate. */
  onRegenerate?: () => void;
}

const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

/** One-line label for an auto-executed tool, for the activity trace. */
function readTraceLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "list_documents":
      return "Listed all posts";
    case "search_documents":
      return `Searched “${asStr(input.query)}”`;
    case "outline_document":
      return input.id
        ? `Outlined ${asStr(input.id)}`
        : "Outlined this document";
    case "read_blocks": {
      const blocks = Array.isArray(input.blocks) ? input.blocks : [];
      return `Read ${blocks.length} block${blocks.length === 1 ? "" : "s"}`;
    }
    case "read_document":
      return input.id ? `Read ${asStr(input.id)}` : "Read this document";
    case "get_selection":
      return "Read the selection";
    default:
      // A command tool: its own title reads better than its wire name, and
      // there is nothing to hand-maintain here as commands are added.
      return commandForTool(name)?.title ?? name.replace(/_/g, " ");
  }
}

const CopilotMessage: React.FC<CopilotMessageProps> = (
  { message, addToolOutput, currentDocId, onRegenerate },
) => {
  const editorRef = useContext(ActiveEditorContext);
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const commandContext = useCommandContext();
  const commandContextRef = useRef(commandContext);
  commandContextRef.current = commandContext;

  const textParts = message.parts.filter(isTextUIPart);
  const toolParts = message.parts.filter(isToolUIPart);

  // Auto-run tools (content reads and `read` commands) show as a muted trace;
  // everything else is a proposal the user accepts.
  const readParts = toolParts.filter((p) => isAutoRunTool(getToolName(p)));
  const writeParts = toolParts.filter((p) => !isAutoRunTool(getToolName(p)));
  const pendingParts = writeParts.filter((p) => p.state === "input-available");
  const appliedParts = writeParts.filter((p) => p.state === "output-available");

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
        editorRef.current,
        currentDocId,
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

      {(textContent || pendingParts.length > 0 || appliedParts.length > 0) && (
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
