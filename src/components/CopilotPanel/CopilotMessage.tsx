"use client";
import { useContext, useState } from "react";
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
import { applyWrite } from "@/editor/utils/copilotAgentExecutors";
import { isReadTool } from "@/lib/ai/copilotAgentTools";
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

/** One-line label for an auto-executed read tool, for the activity trace. */
function readTraceLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "list_documents":
      return "Listed all posts";
    case "search_documents":
      return `Searched “${asStr(input.query)}”`;
    case "read_document":
      return `Read ${asStr(input.path)}`;
    case "read_current_document":
      return "Read the current document";
    case "get_selection":
      return "Read the selection";
    default:
      return name.replace(/_/g, " ");
  }
}

const CopilotMessage: React.FC<CopilotMessageProps> = (
  { message, addToolOutput, currentDocId, onRegenerate },
) => {
  const editorRef = useContext(ActiveEditorContext);
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const textParts = message.parts.filter(isTextUIPart);
  const toolParts = message.parts.filter(isToolUIPart);

  // Read tools auto-run → shown as a muted trace. Write tools are proposals.
  const readParts = toolParts.filter((p) => isReadTool(getToolName(p)));
  const writeParts = toolParts.filter((p) => !isReadTool(getToolName(p)));
  const pendingParts = writeParts.filter((p) => p.state === "input-available");
  const appliedParts = writeParts.filter((p) => p.state === "output-available");

  const textContent = textParts.map((p) => p.text).join("");

  const handleAccept = async () => {
    for (const part of pendingParts) {
      const result = await applyWrite(
        getToolName(part),
        ((part as { input?: unknown }).input ?? {}) as Record<string, unknown>,
        editorRef.current,
        currentDocId,
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
