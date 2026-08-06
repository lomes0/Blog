"use client";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { Box, LinearProgress, Typography } from "@mui/material";
import { Sparkles } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { ActiveEditorContext } from "@/contexts/ActiveEditorContext";
import {
  applyProposal,
  runReadTool,
} from "@/editor/utils/copilotAgentExecutors";
import { isReadTool } from "@/lib/ai/copilotAgentTools";
import {
  isAutoRunCommandTool,
  isProposalTool,
  runCommandTool,
} from "@/lib/ai/commandTools";
import { useCommandContext } from "@/commands/CommandProvider";
import { postsSelectors, useSelector } from "@/store";
import CopilotMessage from "./CopilotMessage";
import QuickActions from "./QuickActions";
import Composer, {
  composerSurfaceSx,
  composerWrapperSx,
} from "./Composer";
import { type SlashCommand, SLASH_COMMANDS } from "./slashCommands";
import { loadCurrentThread, saveCurrentThread } from "./copilotStorage";
import { WORKSPACE_SCOPE } from "@/types";
import { ICON_SIZE } from "@/theme/icons";

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
  /**
   * The document the conversation edits, or `null` on a route with none open
   * (the home pane). With no document the doc-scoped tools have nothing to act
   * on, so the slash commands that drive them are hidden and the agent is left
   * with its library-wide reads.
   */
  documentId: string | null;
  llmConfig: { provider: string; model: string };
  setLlmConfig: (config: { provider: string; model: string }) => void;
  onRegisterAcceptAll: (fn: () => void) => void;
  onPendingCountChange: (n: number) => void;
  /**
   * `"panel"` fills a tall column and shows an empty state; `"inline"` is the
   * floating bar over a document, which starts as nothing but its composer and
   * grows upward as the conversation does.
   */
  variant?: "panel" | "inline";
  /**
   * Whether the thread is written to `copilotStorage`. The panel persists; the
   * inline bar is a scratch surface whose thread is in-memory only and dies on
   * navigation, so the two never write the same scope.
   */
  persist?: boolean;
  /** Disables the composer and replaces the model row with this text. */
  disabledReason?: string;
  /** Reported so a container can size itself to a conversation in progress. */
  onMessageCountChange?: (n: number) => void;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  /**
   * False collapses to the composer alone while keeping the thread mounted —
   * the inline bar's Escape. Hiding rather than unmounting is the point: the
   * conversation is still there when it reopens.
   */
  showTranscript?: boolean;
}

const CopilotChat: React.FC<CopilotChatProps> = (
  {
    documentId,
    llmConfig,
    setLlmConfig,
    onRegisterAcceptAll,
    onPendingCountChange,
    variant = "panel",
    persist = true,
    disabledReason,
    onMessageCountChange,
    inputRef,
    showTranscript = true,
  },
) => {
  const isInline = variant === "inline";
  const editorRef = useContext(ActiveEditorContext);
  // Which storage a thread lands in — IndexedDB for a guest, Postgres for a
  // signed-in author. Decided inside `threadBackendFor`; this is only the
  // session it is decided from.
  const user = useSelector((state) => state.user);
  const doc = useSelector((state) =>
    documentId ? postsSelectors.selectById(state, documentId) : undefined
  );
  const documentTitle = doc?.name ?? "Untitled";
  // Storage is scoped per conversation, and a document-less conversation is
  // still a conversation worth keeping across a panel close.
  const scope = documentId ?? WORKSPACE_SCOPE;
  // What the tool executors call "the open document". They already read the
  // empty string as "none open" — the document readers return empty rather
  // than throwing — so it is the existing spelling of this state, not a new one.
  const openDocId = documentId ?? "";

  const [input, setInput] = useState("");

  // What command tools execute against — the same object a button click gets,
  // which is the whole point of the registry. Held through a ref because
  // `onToolCall` fires from the streaming loop, outside any render's closure.
  const commandContext = useCommandContext();
  const commandContextRef = useRef(commandContext);
  commandContextRef.current = commandContext;

  // Through a ref, and the effects below key on `userId` instead: the session
  // object is replaced whenever the session is refetched, and a dependency on
  // it would re-run the hydrate effect mid-conversation and reset the transcript
  // to whatever was last saved.
  const userRef = useRef(user);
  userRef.current = user;
  const userId = user?.id;

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
            documentTitle: documentId ? documentTitleRef.current : undefined,
            currentPath: documentId ? `${documentId}.md` : undefined,
            provider: llmConfigRef.current.provider,
            model: llmConfigRef.current.model,
          },
        }),
      }),
  );

  // The row this chat writes to. A conversation is one row rewritten on every
  // turn, not one row per message — so the id is minted once per mount and
  // replaced by the stored thread's own id if hydration finds one.
  const threadIdRef = useRef(uuidv4());
  // Nothing may be saved before the stored thread has been read back, or the
  // empty state this component mounts with would be written over it. A
  // non-persisting chat is "hydrated" from the start: it has nothing to read.
  const [hydrated, setHydrated] = useState(!persist);

  // Referenced inside onToolCall (which fires during streaming) but assigned by
  // useChat below — safe because tool calls only resolve after useChat returns.
  const addToolOutputRef = useRef<GenericAddToolOutput | null>(null);

  const {
    messages,
    setMessages,
    sendMessage,
    stop,
    status,
    error,
    addToolOutput,
    regenerate,
  } = useChat({
    transport,
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
      const isCommand = isAutoRunCommandTool(name);
      if (!isReadTool(name) && !isCommand) return;
      void (async () => {
        const input = (toolCall.input ?? {}) as Record<string, unknown>;
        let output: unknown;
        try {
          output = isCommand
            ? await runCommandTool(name, input, commandContextRef.current)
            : await runReadTool(
              name,
              input,
              editorRefRef.current.current,
              openDocId,
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

  // Restore the live conversation for this scope. Storage is async now (it may
  // be a network round trip), so this is an effect rather than a `useState`
  // initializer — and the component is remounted on a scope change, so it runs
  // exactly once per conversation.
  useEffect(() => {
    if (!persist) return;
    let cancelled = false;
    void (async () => {
      const thread = await loadCurrentThread(userRef.current, scope);
      if (cancelled) return;
      if (thread) {
        threadIdRef.current = thread.id;
        if (thread.messages.length > 0) setMessages(thread.messages);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [persist, scope, userId, setMessages]);

  // Persist the thread once it settles (avoid thrashing during streaming).
  useEffect(() => {
    if (!persist || !hydrated) return;
    if (status === "ready" || status === "error") {
      void saveCurrentThread(
        userRef.current,
        scope,
        threadIdRef.current,
        messages,
      );
    }
  }, [messages, status, scope, persist, hydrated]);

  useEffect(() => {
    onMessageCountChange?.(messages.length);
  }, [messages.length, onMessageCountChange]);

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
        .filter((p) => isProposalTool(getToolName(p)));
      for (const p of pending) {
        const result = await applyProposal(
          getToolName(p),
          ((p as { input?: unknown }).input ?? {}) as Record<string, unknown>,
          editor,
          openDocId,
          commandContextRef.current,
        );
        await addToolOutputRef.current?.({
          tool: getToolName(p),
          toolCallId: p.toolCallId,
          output: result,
        });
      }
    }
  }, [messages, openDocId]);

  useEffect(() => {
    onRegisterAcceptAll(acceptAll);
    const count = messages.reduce((acc, msg) => {
      return (
        acc +
        msg.parts
          .filter(isToolUIPart)
          .filter((p) =>
            p.state === "input-available" && isProposalTool(getToolName(p))
          ).length
      );
    }, 0);
    onPendingCountChange(count);
  }, [acceptAll, messages, onRegisterAcceptAll, onPendingCountChange]);

  const sendPrompt = useCallback((text: string) => {
    if (!text.trim() || isLoading || disabledReason) return;
    sendMessage({ text });
  }, [isLoading, sendMessage, disabledReason]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;
    sendPrompt(input);
    setInput("");
  }, [input, isLoading, sendPrompt]);

  // Slash-command autocomplete: active while the input is a single "/token".
  const slashQuery = /^\/\S*$/.test(input) ? input.toLowerCase() : null;
  const slashMatches = slashQuery === null
    ? []
    : SLASH_COMMANDS
      .filter((c) => documentId !== null || !c.needsDocument)
      .filter((c) => c.command.startsWith(slashQuery));
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
      // Dismissing the menu consumes the key. Without this it also reaches the
      // inline bar, which would collapse the whole conversation on the same
      // press that was only meant to close an autocomplete.
      e.stopPropagation();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      // A composing IME uses Enter to commit its candidate. Sending on that
      // press would swallow the word the user was still spelling.
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      if (slashOpen) {
        pickSlashCommand(slashMatches[0]);
      } else {
        handleSend();
      }
    }
  };

  const canSend = Boolean(input.trim()) && !isLoading && !disabledReason;

  // The handoff's "Ask anything, or type / for commands", with the open
  // document named when there is one — which is the only thing the old
  // placeholder said that the new toolbar does not.
  const placeholder = documentId
    ? `Ask anything about "${documentTitle}", or type / for commands`
    : "Ask anything, or type / for commands";

  const genericAddToolOutput = addToolOutput as unknown as (
    args: { tool: string; toolCallId: string; output: unknown },
  ) => Promise<void>;

  // One element, placed by either branch below — the panel wraps it in its own
  // border+surface, the inline bar is already inside one.
  const composer = (
    <Composer
      value={input}
      onChange={setInput}
      onKeyDown={handleKeyDown}
      onSend={handleSend}
      onStop={stop}
      busy={isLoading}
      canSend={canSend}
      placeholder={placeholder}
      disabledReason={disabledReason}
      inputRef={inputRef}
      llmConfig={llmConfig}
      setLlmConfig={setLlmConfig}
      slashOpen={slashOpen}
      slashMatches={slashMatches}
      onPickSlash={pickSlashCommand}
    />
  );

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

      {
        /* Scrollable message / empty-state area. The inline bar has no empty
          state: at rest it is its composer and nothing else, so the document
          behind it stays uncovered until there is something to show. */
      }
      {!showTranscript
        ? null
        : messages.length === 0
        ? isInline ? null : (
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
                I can read and search across all your posts and edit them. Every
                change is shown as a preview you approve first.
              </Typography>
            </Box>
          </Box>
        )
        : (
          <Box
            sx={{
              flex: 1,
              // `minHeight: 0` is what lets this shrink inside the inline bar's
              // capped container instead of forcing it past the cap.
              minHeight: 0,
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
                currentDocId={openDocId}
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

      {
        /* Quick actions — empty state only, and only with a document to act
          on: every one of them is phrased "this document". The home pane
          offers its own library-wide suggestions instead. */
      }
      {messages.length === 0 && documentId !== null && !isInline && (
        <Box sx={{ px: 1.5, pb: 1, flexShrink: 0 }}>
          <QuickActions onSelect={sendPrompt} />
        </Box>
      )}

      {
        /* Composer — the AI-composer design handoff, option 1a.
         *
         * The field and its controls sit in one surface inside a 1px
         * `divider` border, which goes accent while you type.
         *
         * Inline, the floating card is already that wrapper+surface pair
         * (`InlineCopilotBar` draws it around the transcript too), so this only
         * contributes the body. In the panel the composer is alone and draws
         * its own. */
      }
      {isInline
        ? composer
        : (
          <Box sx={{ px: 1.5, pt: 1, pb: 1.5, flexShrink: 0 }}>
            <Box sx={composerWrapperSx}>
              <Box sx={composerSurfaceSx}>
                {composer}
              </Box>
            </Box>
          </Box>
        )}
    </Box>
  );
};

export default CopilotChat;
