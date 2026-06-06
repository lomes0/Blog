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
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import {
  AlertTriangle,
  ChevronDown,
  Send,
  Sparkles,
  Square,
} from "lucide-react";
import { ActiveEditorContext } from "@/contexts/ActiveEditorContext";
import { serializeForCopilot } from "@/editor/utils/serializeForCopilot";
import { applyActions } from "@/editor/utils/copilotToolExecutors";
import { documentsSelectors, useSelector } from "@/store";
import { AI_MODELS } from "@/lib/ai/models";
import type { CopilotAction } from "@/types";
import CopilotMessage from "./CopilotMessage";
import QuickActions from "./QuickActions";
import { loadCurrentThread, saveCurrentThread } from "./copilotStorage";

const PROVIDER_COLOR: Record<string, string> = {
  anthropic: "#D97757",
  google: "#4285F4",
  azure: "#0078D4",
  ollama: "#888888",
};

interface SlashCommand {
  command: string;
  description: string;
  prompt: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: "/summarize",
    description: "Summarize the document",
    prompt: "Summarize this document in 3 bullet points.",
  },
  {
    command: "/fix",
    description: "Fix grammar and spelling",
    prompt: "Fix any grammar and spelling mistakes.",
  },
  {
    command: "/improve",
    description: "Improve clarity and flow",
    prompt: "Improve the clarity and flow of this document while preserving " +
      "its meaning.",
  },
  {
    command: "/section",
    description: "Add a new section",
    prompt: "Suggest and add a new section to this document.",
  },
  {
    command: "/table",
    description: "Insert a summary table",
    prompt: "Insert a table summarizing the key points of this document.",
  },
];

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
  // Document context is serialized once per send (in sendPrompt) and read here
  // so the banner reflects exactly what was sent.
  const documentContextRef = useRef<string>("");
  const [contextTruncated, setContextTruncated] = useState(false);

  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/copilot",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            messages,
            ...(body as object | undefined),
            documentTitle: documentTitleRef.current,
            documentContext: documentContextRef.current,
            selectedText: selectedTextRef.current,
            provider: llmConfigRef.current.provider,
            model: llmConfigRef.current.model,
          },
        }),
      }),
  );

  // Seed from the persisted thread for this document. The component is
  // remounted (keyed on documentId) when the document changes, so reading
  // once here is correct.
  const [initialMessages] = useState(() => loadCurrentThread(documentId));

  const {
    messages,
    sendMessage,
    stop,
    status,
    error,
    addToolOutput,
    regenerate,
  } = useChat({ transport, messages: initialMessages });

  const isLoading = status === "submitted" || status === "streaming";

  // Persist the thread once it settles (avoid thrashing during streaming).
  useEffect(() => {
    if (status === "ready" || status === "error") {
      saveCurrentThread(documentId, messages);
    }
  }, [messages, status, documentId]);

  // The most recent assistant message is the one offered for regeneration.
  const lastAssistantId = [...messages].reverse().find((m) =>
    m.role === "assistant"
  )?.id;

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

  const sendPrompt = useCallback((text: string) => {
    if (!text.trim() || isLoading) return;
    const editor = editorRefRef.current.current;
    selectedTextRef.current = editor?.getEditorState().read(() => {
      const sel = $getSelection();
      return $isRangeSelection(sel) ? sel.getTextContent() : undefined;
    });
    const ctx = editor
      ? serializeForCopilot(editor)
      : { content: "", truncated: false };
    documentContextRef.current = ctx.content;
    setContextTruncated(ctx.truncated);
    sendMessage({ text });
  }, [isLoading, sendMessage]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;
    sendPrompt(input);
    setInput("");
  }, [input, isLoading, sendPrompt]);

  // Slash-command autocomplete: active while the input is a single "/token".
  const slashQuery = /^\/\S*$/.test(input) ? input.toLowerCase() : null;
  const slashMatches = slashQuery === null
    ? []
    : SLASH_COMMANDS.filter((c) => c.command.startsWith(slashQuery));
  const slashOpen = slashMatches.length > 0 && !isLoading;

  const pickSlashCommand = (cmd: SlashCommand) => {
    setInput("");
    sendPrompt(cmd.prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && slashOpen) {
      setInput("");
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (slashOpen) {
        pickSlashCommand(slashMatches[0]);
      } else {
        handleSend();
      }
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
                onRegenerate={!isLoading && msg.id === lastAssistantId
                  ? () => regenerate({ messageId: msg.id })
                  : undefined}
              />
            ))}
          </Box>
        )}

      {error && (
        <Box
          sx={{
            px: 2,
            py: 1,
            bgcolor: "error.main",
            color: "error.contrastText",
            flexShrink: 0,
          }}
        >
          <Typography variant="caption">
            {/Unauthorized|sign in|401/i.test(error.message)
              ? "Sign in to use Copilot."
              : error.message}
          </Typography>
        </Box>
      )}

      {/* Quick actions — visible only in empty state */}
      {messages.length === 0 && (
        <Box sx={{ px: 1.5, pb: 1, flexShrink: 0 }}>
          <QuickActions onSelect={sendPrompt} />
        </Box>
      )}

      {contextTruncated && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            px: 1.5,
            py: 0.75,
            flexShrink: 0,
            color: "warning.main",
          }}
        >
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <Typography variant="caption" color="text.secondary">
            This document is long — Copilot only sees the first part, so edits
            beyond that point may be missed.
          </Typography>
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
          position: "relative",
        }}
      >
        {slashOpen && (
          <Paper
            elevation={3}
            sx={{
              position: "absolute",
              bottom: "100%",
              left: 12,
              right: 12,
              mb: 0.5,
              py: 0.5,
              maxHeight: 220,
              overflowY: "auto",
              zIndex: 1,
            }}
          >
            {slashMatches.map((cmd, idx) => (
              <Box
                key={cmd.command}
                onClick={() => pickSlashCommand(cmd)}
                sx={{
                  px: 1.5,
                  py: 0.75,
                  cursor: "pointer",
                  bgcolor: idx === 0 ? "action.hover" : "transparent",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {cmd.command}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {cmd.description}
                </Typography>
              </Box>
            ))}
          </Paper>
        )}

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
            "& .MuiOutlinedInput-root": {
              borderRadius: 2,
              fontSize: "0.8rem",
              bgcolor: "background.input",
            },
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
