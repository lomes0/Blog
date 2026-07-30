"use client";
import { useRef, useState } from "react";
import {
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from "@mui/material";
import { History, Plus, X } from "lucide-react";
import { actions, postsSelectors, useDispatch, useSelector } from "@/store";
import { AI_MODELS } from "@/lib/ai/models";
import { useAIModel } from "@/contexts/AIModelContext";
import { useLayoutMode } from "@/contexts/LayoutModeContext";
import CopilotChat from "./CopilotChat";
import {
  archiveThread,
  clearCurrentThread,
  type CopilotThread,
  loadCurrentThread,
  loadHistory,
  removeFromHistory,
  saveCurrentThread,
} from "./copilotStorage";
import { ICON_SIZE } from "@/theme/icons";

interface CopilotPanelProps {
  documentId: string;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const CopilotPanel: React.FC<CopilotPanelProps> = ({ documentId }) => {
  const dispatch = useDispatch();

  const { llm: llmConfig, setLlm: setLlmConfig } = useAIModel();
  const { startCopilotResize, isCopilotResizing } = useLayoutMode();

  const [chatKey, setChatKey] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [historyAnchor, setHistoryAnchor] = useState<null | HTMLElement>(null);
  const [history, setHistory] = useState<CopilotThread[]>([]);
  const acceptAllRef = useRef<(() => void) | null>(null);

  const doc = useSelector((state) =>
    postsSelectors.selectById(state, documentId)
  );
  const documentTitle = doc.name ?? "Untitled";
  const currentModel = AI_MODELS.find((m) => m.id === llmConfig.model);

  const handleAcceptAll = () => {
    acceptAllRef.current?.();
  };

  // Archive the active thread and start fresh.
  const handleNewConversation = () => {
    archiveThread(documentId, loadCurrentThread(documentId));
    clearCurrentThread(documentId);
    setChatKey((k) => k + 1);
  };

  const openHistory = (e: React.MouseEvent<HTMLElement>) => {
    setHistory(loadHistory(documentId));
    setHistoryAnchor(e.currentTarget);
  };

  // Restore a past thread: archive the current one, then make the chosen
  // thread current and remount the chat to load it.
  const handleSelectThread = (thread: CopilotThread) => {
    archiveThread(documentId, loadCurrentThread(documentId));
    removeFromHistory(documentId, thread.id);
    saveCurrentThread(documentId, thread.messages);
    setHistoryAnchor(null);
    setChatKey((k) => k + 1);
  };

  return (
    <Box
      sx={{
        borderLeft: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
        overflow: "hidden",
        bgcolor: "background.panel",
        flexShrink: 0,
      }}
    >
      {/* Drag handle on the left edge — dragging widens the panel */}
      <Box
        onMouseDown={startCopilotResize}
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: 4,
          cursor: "col-resize",
          backgroundColor: isCopilotResizing ? "primary.main" : "transparent",
          transition: isCopilotResizing ? "none" : "background-color 0.2s",
          "&:hover": { backgroundColor: "primary.main", opacity: 0.5 },
          "&:active": { backgroundColor: "primary.main", opacity: 1 },
          zIndex: 1300,
        }}
      />

      {/* Header */}
      <Box
        sx={{
          px: 1.5,
          py: 0.75,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          flexShrink: 0,
        }}
      >
        <Tooltip title="New conversation">
          <IconButton
            size="small"
            onClick={handleNewConversation}
            aria-label="New conversation"
          >
            <Plus size={ICON_SIZE.dense} />
          </IconButton>
        </Tooltip>

        <Box sx={{ flex: 1, minWidth: 0, ml: 0.5 }}>
          <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>
            Copilot
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            display="block"
          >
            Editing &ldquo;{documentTitle}&rdquo; &middot;{" "}
            {currentModel?.name ?? llmConfig.model}
          </Typography>
        </Box>

        {pendingCount > 0 && (
          <Button
            size="small"
            variant="contained"
            onClick={handleAcceptAll}
            sx={{
              textTransform: "none",
              typography: "micro",
              py: 0.25,
              px: 1,
              flexShrink: 0,
            }}
          >
            Accept all
          </Button>
        )}

        <Tooltip title="Conversation history">
          <IconButton
            size="small"
            onClick={openHistory}
            aria-label="Conversation history"
          >
            <History size={ICON_SIZE.dense} />
          </IconButton>
        </Tooltip>
        <IconButton
          size="small"
          onClick={() => dispatch(actions.setCopilotOpen(false))}
          aria-label="Close Copilot"
        >
          <X size={ICON_SIZE.dense} />
        </IconButton>

        <Menu
          anchorEl={historyAnchor}
          open={Boolean(historyAnchor)}
          onClose={() => setHistoryAnchor(null)}
          slotProps={{ paper: { sx: { minWidth: 240, maxWidth: 320 } } }}
        >
          {history.length === 0
            ? (
              <MenuItem disabled sx={{ typography: "dense" }}>
                No past conversations
              </MenuItem>
            )
            : history.map((thread) => (
              <MenuItem
                key={thread.id}
                onClick={() => handleSelectThread(thread)}
                sx={{ display: "block", py: 0.75 }}
              >
                <Typography variant="body2" noWrap>
                  {thread.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatRelativeTime(thread.updatedAt)}
                </Typography>
              </MenuItem>
            ))}
        </Menu>
      </Box>

      <CopilotChat
        key={`${documentId}:${chatKey}`}
        documentId={documentId}
        llmConfig={llmConfig}
        setLlmConfig={setLlmConfig}
        onRegisterAcceptAll={(fn) => {
          acceptAllRef.current = fn;
        }}
        onPendingCountChange={setPendingCount}
      />
    </Box>
  );
};

export default CopilotPanel;
