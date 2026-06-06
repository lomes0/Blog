"use client";
import { useContext, useState } from "react";
import type { UIMessage } from "ai";
import { getToolName, isTextUIPart, isToolUIPart } from "ai";
import { Box, Button, Chip, IconButton, Tooltip, Typography } from "@mui/material";
import { Check, Copy, RefreshCw } from "lucide-react";
import { ActiveEditorContext } from "@/contexts/ActiveEditorContext";
import { applyActions } from "@/editor/utils/copilotToolExecutors";
import type { CopilotAction } from "@/types";
import ActionPreview from "./ActionPreview";
import MarkdownText from "./MarkdownText";

type AddToolOutput = (
  args: { tool: string; toolCallId: string; output: unknown },
) => Promise<void>;

interface CopilotMessageProps {
  message: UIMessage;
  addToolOutput: AddToolOutput;
  /** Provided only for the latest assistant message; enables regenerate. */
  onRegenerate?: () => void;
}

const CopilotMessage: React.FC<CopilotMessageProps> = (
  { message, addToolOutput, onRegenerate },
) => {
  const editorRef = useContext(ActiveEditorContext);
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const textParts = message.parts.filter(isTextUIPart);
  const toolParts = message.parts.filter(isToolUIPart);

  const pendingParts = toolParts.filter((p) => p.state === "input-available");
  const appliedParts = toolParts.filter((p) => p.state === "output-available");

  const textContent = textParts.map((p) => p.text).join("");

  const handleAccept = async () => {
    if (!editorRef.current) return;
    const acts: CopilotAction[] = pendingParts.map((p) => ({
      type: getToolName(p),
      params: ((p as { input?: unknown }).input ?? {}) as Record<
        string,
        unknown
      >,
    }));
    applyActions(editorRef.current, acts);
    for (const part of pendingParts) {
      await addToolOutput({
        tool: getToolName(part),
        toolCallId: part.toolCallId,
        output: { success: true },
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
                startIcon={<Check size={14} />}
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
            icon={<Check size={12} />}
            label="Applied"
            color="success"
            variant="outlined"
            sx={{ mt: 0.5, height: 20, fontSize: "0.7rem" }}
          />
        )}
      </Box>

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
                {copied ? <Check size={13} /> : <Copy size={13} />}
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
                <RefreshCw size={13} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
    </Box>
  );
};

export default CopilotMessage;
