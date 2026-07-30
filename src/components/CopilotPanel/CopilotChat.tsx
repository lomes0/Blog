"use client";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
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
import { ChevronDown, Send, Sparkles, Square } from "lucide-react";
import { ActiveEditorContext } from "@/contexts/ActiveEditorContext";
import {
  applyWrite,
  runReadTool,
} from "@/editor/utils/copilotAgentExecutors";
import { isReadTool, isWriteTool } from "@/lib/ai/copilotAgentTools";
import { postsSelectors, useSelector } from "@/store";
import { AI_MODELS } from "@/lib/ai/models";
import CopilotMessage from "./CopilotMessage";
import QuickActions from "./QuickActions";
import { loadCurrentThread, saveCurrentThread } from "./copilotStorage";
import { ICON_SIZE } from "@/theme/icons";

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
    prompt: "Summarize the current document in 3 bullet points.",
  },
  {
    command: "/fix",
    description: "Fix grammar and spelling",
    prompt: "Fix any grammar and spelling mistakes in the current document.",
  },
  {
    command: "/improve",
    description: "Improve clarity and flow",
    prompt: "Improve the clarity and flow of the current document while " +
      "preserving its meaning.",
  },
  {
    command: "/section",
    description: "Add a new section",
    prompt: "Suggest and add a new section to the current document.",
  },
  {
    command: "/find",
    description: "Search across all posts",
    prompt: "Search my posts for ",
  },
];

// Shape of useChat.addToolOutput used across the read (auto) and write (accept)
// paths — the union of success-output and error-output signatures.
type GenericAddToolOutput = (
  args:
    | { tool: string; toolCallId: string; output: unknown }
    | {
      tool: string;
      toolCallId: string;
      state: "output-error";
      errorText: string;
    },
) => Promise<void>;

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
    postsSelectors.selectById(state, documentId)
  );
  const documentTitle = doc.name ?? "Untitled";

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

  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/copilot",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            messages,
            ...(body as object | undefined),
            documentTitle: documentTitleRef.current,
            currentPath: `${documentId}.md`,
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

  // Referenced inside onToolCall (which fires during streaming) but assigned by
  // useChat below — safe because tool calls only resolve after useChat returns.
  const addToolOutputRef = useRef<GenericAddToolOutput | null>(null);

  const {
    messages,
    sendMessage,
    stop,
    status,
    error,
    addToolOutput,
    regenerate,
  } = useChat({
    transport,
    messages: initialMessages,
    // Resume the agent loop automatically once every tool call in the latest
    // assistant message has a result. Auto-executed read tools satisfy this
    // immediately; write proposals hold the loop until the user accepts (which
    // fills their result), which is exactly the review gate we want.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // Read tools run automatically so the agent can explore the library; write
    // tools are left pending (input-available) for the user to review + accept.
    // Do NOT await addToolOutput here — awaiting inside onToolCall can deadlock.
    onToolCall: ({ toolCall }) => {
      const name = toolCall.toolName;
      if (!isReadTool(name)) return;
      void (async () => {
        let output: unknown;
        try {
          output = await runReadTool(
            name,
            (toolCall.input ?? {}) as Record<string, unknown>,
            editorRefRef.current.current,
            documentId,
          );
        } catch (e) {
          output = { error: e instanceof Error ? e.message : String(e) };
        }
        void addToolOutputRef.current?.({
          tool: name,
          toolCallId: toolCall.toolCallId,
          output,
        });
      })();
    },
  });
  addToolOutputRef.current = addToolOutput as unknown as GenericAddToolOutput;

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

  const acceptAll = useCallback(async () => {
    const editor = editorRefRef.current.current;
    for (const msg of messages) {
      const pending = msg.parts
        .filter(isToolUIPart)
        .filter((p) => p.state === "input-available")
        .filter((p) => isWriteTool(getToolName(p)));
      for (const p of pending) {
        const result = await applyWrite(
          getToolName(p),
          ((p as { input?: unknown }).input ?? {}) as Record<string, unknown>,
          editor,
          documentId,
        );
        await addToolOutputRef.current?.({
          tool: getToolName(p),
          toolCallId: p.toolCallId,
          output: result,
        });
      }
    }
  }, [messages, documentId]);

  useEffect(() => {
    onRegisterAcceptAll(acceptAll);
    const count = messages.reduce((acc, msg) => {
      return (
        acc +
        msg.parts
          .filter(isToolUIPart)
          .filter((p) =>
            p.state === "input-available" && isWriteTool(getToolName(p))
          ).length
      );
    }, 0);
    onPendingCountChange(count);
  }, [acceptAll, messages, onRegisterAcceptAll, onPendingCountChange]);

  const sendPrompt = useCallback((text: string) => {
    if (!text.trim() || isLoading) return;
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
    // "/find" seeds the input for the user to complete; others send directly.
    if (cmd.prompt.endsWith(" ")) {
      setInput(cmd.prompt);
      return;
    }
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

  const genericAddToolOutput = addToolOutput as unknown as (
    args: { tool: string; toolCallId: string; output: unknown },
  ) => Promise<void>;

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
              <Sparkles size={ICON_SIZE.large} color="white" />
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Ask Copilot about your posts
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ maxWidth: 260, mx: "auto" }}
              >
                I can read and search across all your posts and edit them.
                Every change is shown as a preview you approve first.
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
                currentDocId={documentId}
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
              typography: "dense",
              bgcolor: "background.input",
            },
            "& .MuiOutlinedInput-input::placeholder": { typography: "dense" },
          }}
        />

        {/* Footer row: model selector · send */}
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
              typography: "caption",
            }}
          >
            <Box
              component="span"
              sx={{
                width: 10,
                height: 10,
                borderRadius: 0.5,
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
            <ChevronDown size={ICON_SIZE.micro} />
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
                sx={{ typography: "dense" }}
              >
                <Box
                  component="span"
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: 0.5,
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
                <Square size={ICON_SIZE.dense} />
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
                <Send size={ICON_SIZE.dense} />
              </IconButton>
            )}
        </Box>
      </Box>
    </Box>
  );
};

export default CopilotChat;
