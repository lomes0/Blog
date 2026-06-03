"use client";
import { useContext } from "react";
import type { UIMessage } from "ai";
import { getToolName, isTextUIPart, isToolUIPart } from "ai";
import { Box, Button, Chip, Typography } from "@mui/material";
import { Check } from "lucide-react";
import { ActiveEditorContext } from "@/contexts/ActiveEditorContext";
import { applyActions } from "@/editor/utils/copilotToolExecutors";
import type { CopilotAction } from "@/types";

type AddToolOutput = (
  args: { tool: string; toolCallId: string; output: unknown },
) => Promise<void>;

interface CopilotMessageProps {
  message: UIMessage;
  addToolOutput: AddToolOutput;
}

function formatToolName(name: string): string {
  return name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

const CopilotMessage: React.FC<CopilotMessageProps> = (
  { message, addToolOutput },
) => {
  const editorRef = useContext(ActiveEditorContext);
  const isUser = message.role === "user";

  const textParts = message.parts.filter(isTextUIPart);
  const toolParts = message.parts.filter(isToolUIPart);

  const pendingParts = toolParts.filter((p) => p.state === "input-available");
  const appliedParts = toolParts.filter((p) => p.state === "output-available");

  const textContent = textParts.map((p) => p.text).join("");

  const handleApply = async () => {
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

  const handleDismiss = async () => {
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
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {textContent}
          </Typography>
        )}

        {pendingParts.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Typography
              variant="caption"
              color={isUser ? "primary.contrastText" : "text.secondary"}
              display="block"
              sx={{ mb: 0.5 }}
            >
              Pending:{" "}
              {pendingParts.map((p) => formatToolName(getToolName(p))).join(
                ", ",
              )}
            </Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                size="small"
                variant="contained"
                startIcon={<Check size={14} />}
                onClick={handleApply}
                sx={{ py: 0.25 }}
              >
                Apply
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={handleDismiss}
                sx={{ py: 0.25 }}
              >
                Dismiss
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
    </Box>
  );
};

export default CopilotMessage;
