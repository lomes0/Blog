"use client";
import { useCallback, useContext, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { $getSelection, $isRangeSelection } from "lexical";
import {
  Box,
  IconButton,
  LinearProgress,
  TextField,
  Typography,
} from "@mui/material";
import { Send, Square } from "lucide-react";
import { ActiveEditorContext } from "@/contexts/ActiveEditorContext";
import { serializeForCopilot } from "@/editor/utils/serializeForCopilot";
import { documentsSelectors, useSelector } from "@/store";
import useLocalStorage from "@/hooks/useLocalStorage";
import CopilotMessage from "./CopilotMessage";
import QuickActions from "./QuickActions";

interface CopilotChatProps {
  documentId: string;
}

const CopilotChat: React.FC<CopilotChatProps> = ({ documentId }) => {
  const editorRef = useContext(ActiveEditorContext);
  const doc = useSelector((state) =>
    documentsSelectors.selectById(state, documentId)
  );
  const documentTitle = doc?.cloud?.name ?? doc?.local?.name ?? "Untitled";

  const [llmConfig] = useLocalStorage("llm", {
    provider: "google",
    model: "gemini-2.5-flash",
  });
  const [input, setInput] = useState("");

  // Refs so prepareSendMessagesRequest always sees fresh values
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

  // Cast addToolOutput to a generic form for CopilotMessage
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

      {messages.length === 0
        ? (
          <Box sx={{ flex: 1, overflow: "hidden auto", p: 2 }}>
            <Typography
              variant="body2"
              color="text.secondary"
              align="center"
              sx={{ mb: 2 }}
            >
              Ask Copilot anything about your document
            </Typography>
            <QuickActions onSelect={(prompt) => setInput(prompt)} />
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

      <Box
        sx={{
          p: 1,
          borderTop: 1,
          borderColor: "divider",
          display: "flex",
          gap: 1,
          flexShrink: 0,
          alignItems: "flex-end",
        }}
      >
        <TextField
          fullWidth
          size="small"
          placeholder="Ask anything…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          multiline
          maxRows={4}
          disabled={isLoading}
        />
        {isLoading
          ? (
            <IconButton onClick={stop} size="small" sx={{ mb: 0.25 }}>
              <Square size={16} />
            </IconButton>
          )
          : (
            <IconButton
              color="primary"
              onClick={handleSend}
              disabled={!input.trim()}
              size="small"
              sx={{ mb: 0.25 }}
            >
              <Send size={16} />
            </IconButton>
          )}
      </Box>
    </Box>
  );
};

export default CopilotChat;
