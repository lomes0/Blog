"use client";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { getToolName, isToolUIPart } from "ai";
import { $getSelection, $isRangeSelection } from "lexical";
import {
  Box,
  IconButton,
  LinearProgress,
  Menu,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { AtSign, ChevronDown, Send, Sparkles, Square } from "lucide-react";
import { ActiveEditorContext } from "@/contexts/ActiveEditorContext";
import { serializeForCopilot } from "@/editor/utils/serializeForCopilot";
import { applyActions } from "@/editor/utils/copilotToolExecutors";
import { documentsSelectors, useSelector } from "@/store";
import { AI_MODELS } from "@/lib/ai/models";
import type { CopilotAction } from "@/types";
import CopilotMessage from "./CopilotMessage";
import QuickActions from "./QuickActions";

const PROVIDER_COLOR: Record<string, string> = {
  anthropic: "#D97757",
  google: "#4285F4",
  azure: "#0078D4",
  ollama: "#888888",
};

interface CopilotChatProps {
  documentId: string;
  llmConfig: { provider: string; model: string };
  setLlmConfig: (config: { provider: string; model: string }) => void;
  onRegisterAcceptAll: (fn: () => void) => void;
  onPendingCountChange: (n: number) => void;
}

const CopilotChat: React.FC<CopilotChatProps> = (
  {
    documentId,
    llmConfig,
    setLlmConfig,
    onRegisterAcceptAll,
    onPendingCountChange,
  },
) => {
  const editorRef = useContext(ActiveEditorContext);
  const doc = useSelector((state) =>
    documentsSelectors.selectById(state, documentId)
  );
  const documentTitle = doc?.cloud?.name ?? doc?.local?.name ?? "Untitled";

  const [input, setInput] = useState("");
  const [modelMenuAnchor, setModelMenuAnchor] = useState<null | HTMLElement>(
    null,
  );

  const editorRefRef = useRef(editorRef);
  editorRefRef.current = editorRef;
  const documentTitleRef = useRef(documentTitle);
  documentTitleRef.current = documentTitle;
  const llmConfigRef = useRef(llmConfig);
  llmConfigRef.current = llmConfig;
  const selectedTextRef = useRef<string | undefined>(undefined);

  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/copilot",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            messages,
            ...(body as object | undefined),
            documentTitle: documentTitleRef.current,
            documentContext: editorRefRef.current.current
              ? serializeForCopilot(editorRefRef.current.current)
              : "",
            selectedText: selectedTextRef.current,
            provider: llmConfigRef.current.provider,
            model: llmConfigRef.current.model,
          },
        }),
      }),
  );

  const { messages, sendMessage, stop, status, error, addToolOutput } = useChat(
    { transport },
  );

  const isLoading = status === "submitted" || status === "streaming";

  const addToolOutputRef = useRef(addToolOutput);
  addToolOutputRef.current = addToolOutput;

  const acceptAll = useCallback(() => {
    if (!editorRefRef.current.current) return;
    for (const msg of messages) {
      const pending = msg.parts
        .filter(isToolUIPart)
        .filter((p) => p.state === "input-available");
      if (pending.length === 0) continue;
      const acts: CopilotAction[] = pending.map((p) => ({
        type: getToolName(p),
        params: ((p as { input?: unknown }).input ?? {}) as Record<
          string,
          unknown
        >,
      }));
      applyActions(editorRefRef.current.current, acts);
      for (const p of pending) {
        void addToolOutputRef.current({
          tool: getToolName(p),
          toolCallId: p.toolCallId,
          output: { success: true },
        });
      }
    }
  }, [messages]);

  useEffect(() => {
    onRegisterAcceptAll(acceptAll);
    const count = messages.reduce((acc, msg) => {
      return (
        acc +
        msg.parts
          .filter(isToolUIPart)
          .filter((p) => p.state === "input-available").length
      );
    }, 0);
    onPendingCountChange(count);
  }, [acceptAll, messages, onRegisterAcceptAll, onPendingCountChange]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;
    selectedTextRef.current = editorRefRef.current.current?.getEditorState()
      .read(() => {
        const sel = $getSelection();
        return $isRangeSelection(sel) ? sel.getTextContent() : undefined;
      });
    sendMessage({ text: input });
    setInput("");
  }, [input, isLoading, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleModelSelect = (modelId: string, provider: string) => {
    setLlmConfig({ provider, model: modelId });
    setModelMenuAnchor(null);
  };

  const currentModel = AI_MODELS.find((m) => m.id === llmConfig.model);
  const providerColor = PROVIDER_COLOR[llmConfig.provider] ?? "#888";

  type GenericAddToolOutput = (
    args: { tool: string; toolCallId: string; output: unknown },
  ) => Promise<void>;
  const genericAddToolOutput = addToolOutput as unknown as GenericAddToolOutput;

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {isLoading && <LinearProgress sx={{ flexShrink: 0 }} />}

      {/* Scrollable message / empty-state area */}
      {messages.length === 0
        ? (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              p: 3,
              gap: 2,
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                width: 64,
                height: 64,
                bgcolor: "primary.main",
                borderRadius: 3,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Sparkles size={28} color="white" />
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Ask Copilot to edit this doc
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ maxWidth: 260, mx: "auto" }}
              >
                Describe a change in plain language. I&apos;ll show a preview
                before anything touches your document.
              </Typography>
            </Box>
          </Box>
        )
        : (
          <Box
            sx={{
              flex: 1,
              overflow: "hidden auto",
              p: 1,
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            {messages.map((msg) => (
              <CopilotMessage
                key={msg.id}
                message={msg}
                addToolOutput={genericAddToolOutput}
              />
            ))}
          </Box>
        )}

      {error && (
        <Box
          sx={{
            px: 2,
            py: 1,
            bgcolor: "error.light",
            color: "error.contrastText",
            flexShrink: 0,
          }}
        >
          <Typography variant="caption">{error.message}</Typography>
        </Box>
      )}

      {/* Quick actions — visible only in empty state */}
      {messages.length === 0 && (
        <Box sx={{ px: 1.5, pb: 1, flexShrink: 0 }}>
          <QuickActions onSelect={(prompt) => setInput(prompt)} />
        </Box>
      )}

      {/* Input area */}
      <Box
        sx={{
          px: 1.5,
          pt: 1,
          pb: 1.5,
          borderTop: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <TextField
          fullWidth
          size="small"
          placeholder={`Ask Copilot to edit "${documentTitle}", or / for commands…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          multiline
          maxRows={4}
          disabled={isLoading}
          sx={{
            "& .MuiOutlinedInput-root": { borderRadius: 2, fontSize: "0.8rem" },
            "& .MuiOutlinedInput-input::placeholder": { fontSize: "0.8rem" },
          }}
        />

        {/* Footer row: @ · model selector · send */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            mt: 0.75,
            gap: 0.25,
          }}
        >
          <IconButton
            size="small"
            aria-label="Mention"
            sx={{ color: "text.secondary" }}
          >
            <AtSign size={15} />
          </IconButton>

          <IconButton
            size="small"
            onClick={(e) => setModelMenuAnchor(e.currentTarget)}
            aria-label="Select model"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              borderRadius: 1,
              px: 0.75,
              color: "text.secondary",
              fontSize: "0.75rem",
            }}
          >
            <Box
              component="span"
              sx={{
                width: 10,
                height: 10,
                borderRadius: "2px",
                bgcolor: providerColor,
                flexShrink: 0,
                display: "inline-block",
              }}
            />
            <Typography
              variant="caption"
              sx={{ color: "text.secondary", lineHeight: 1 }}
            >
              {currentModel?.name ?? llmConfig.model}
            </Typography>
            <ChevronDown size={12} />
          </IconButton>

          <Menu
            anchorEl={modelMenuAnchor}
            open={Boolean(modelMenuAnchor)}
            onClose={() => setModelMenuAnchor(null)}
            slotProps={{ paper: { sx: { minWidth: 200 } } }}
            anchorOrigin={{ vertical: "top", horizontal: "left" }}
            transformOrigin={{ vertical: "bottom", horizontal: "left" }}
          >
            {AI_MODELS.map((m) => (
              <MenuItem
                key={m.id}
                selected={m.id === llmConfig.model}
                onClick={() => handleModelSelect(m.id, m.provider)}
                sx={{ fontSize: "0.8rem" }}
              >
                <Box
                  component="span"
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "2px",
                    bgcolor: PROVIDER_COLOR[m.provider] ?? "#888",
                    mr: 1,
                    flexShrink: 0,
                    display: "inline-block",
                  }}
                />
                {m.name}
              </MenuItem>
            ))}
          </Menu>

          <Box sx={{ flex: 1 }} />

          {isLoading
            ? (
              <IconButton onClick={stop} size="small">
                <Square size={15} />
              </IconButton>
            )
            : (
              <IconButton
                onClick={handleSend}
                disabled={!input.trim()}
                size="small"
                aria-label="Send"
                sx={{
                  bgcolor: input.trim()
                    ? "primary.main"
                    : "action.disabledBackground",
                  color: input.trim()
                    ? "primary.contrastText"
                    : "action.disabled",
                  "&:hover": {
                    bgcolor: input.trim()
                      ? "primary.dark"
                      : "action.disabledBackground",
                  },
                  transition: "background-color 0.15s",
                }}
              >
                <Send size={15} />
              </IconButton>
            )}
        </Box>
      </Box>
    </Box>
  );
};

export default CopilotChat;
