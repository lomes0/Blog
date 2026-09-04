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
import { postsSelectors, useSelector } from "@/store";
import { useAIModel } from "@/contexts/AIModelContext";
import { useLayoutMode } from "@/contexts/LayoutModeContext";
import ResizeGripper from "@/components/Layout/ResizeGripper";
import CopilotChat from "./CopilotChat";
import {
  archiveCurrentThread,
  loadCurrentThread,
  loadHistory,
  resumeThread,
} from "./copilotStorage";
import { type CopilotThread, WORKSPACE_SCOPE } from "@/types";
import { ICON_SIZE } from "@/theme/icons";
import { CHROME_BAR_H } from "@/theme/tokens";

interface CopilotPanelProps {
  /** `null` on a route with no document open — see {@link CopilotChat}. */
  documentId: string | null;
}

function formatRelativeTime(isoTimestamp: string): string {
  const diff = Date.now() - Date.parse(isoTimestamp);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const CopilotPanel: React.FC<CopilotPanelProps> = ({ documentId }) => {
  const { llm: llmConfig, setLlm: setLlmConfig } = useAIModel();
  const { startCopilotResize, isCopilotResizing, setCopilotOpen } =
    useLayoutMode();

  const [chatKey, setChatKey] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [historyAnchor, setHistoryAnchor] = useState<null | HTMLElement>(null);
  const [history, setHistory] = useState<CopilotThread[]>([]);
  const acceptAllRef = useRef<(() => void) | null>(null);

  const user = useSelector((state) => state.user);
  const doc = useSelector((state) =>
    documentId ? postsSelectors.selectById(state, documentId) : undefined
  );
  const documentTitle = doc?.title ?? "Untitled";
  const scope = documentId ?? WORKSPACE_SCOPE;

  const handleAcceptAll = () => {
    acceptAllRef.current?.();
  };

  // Archive the active thread and start fresh. Bumping `chatKey` remounts the
  // chat, whose own load effect then finds no live thread and starts one.
  const handleNewConversation = async () => {
    await archiveCurrentThread(user, await loadCurrentThread(user, scope));
    setChatKey((k) => k + 1);
  };

  // Opened on click rather than kept in sync: a menu that is closed has nothing
  // to be stale about, and this is now a fetch.
  const openHistory = async (e: React.MouseEvent<HTMLElement>) => {
    setHistoryAnchor(e.currentTarget);
    setHistory(await loadHistory(user, scope));
  };

  // Restore a past thread: archive the current one, then make the chosen
  // thread current and remount the chat to load it.
  const handleSelectThread = async (thread: CopilotThread) => {
    setHistoryAnchor(null);
    await resumeThread(user, await loadCurrentThread(user, scope), thread);
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
      <ResizeGripper
        isResizing={isCopilotResizing}
        onMouseDown={startCopilotResize}
        label="Resize Copilot panel"
      />

      {/* Header */}
      <Box
        sx={{
          px: 1.5,
          // The shell's one chrome-bar axis (DESIGN.md §17.1). This header used
          // to stack its title and its scope, which made it ~51px against the
          // editor top bar's 40 and the right rail's 36 — three rules at three
          // heights across three touching columns. The scope is on the title's
          // line now, which is what buys the height back.
          minHeight: CHROME_BAR_H,
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

        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            ml: 0.5,
            display: "flex",
            alignItems: "baseline",
            gap: 0.75,
          }}
        >
          <Typography variant="subtitle2" sx={{ flexShrink: 0 }}>
            Copilot
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ minWidth: 0 }}
          >
            {
              /* Scope only. The model now has one home — the button on the
                composer's edge — and naming it here as well meant changing it
                in one place and reading it in two. */
            }
            {documentId
              ? <>Editing &ldquo;{documentTitle}&rdquo;</>
              : "All posts"}
          </Typography>
        </Box>

        {
          /* *Actions*, not edits. Since §4.4 a content write is proposed on the
            tool call and answered on the document itself, so the only things
            waiting in the transcript are command proposals — a pane split, a
            rename, a theme change. "Accept all" would now read as covering the
            edits as well, and it does not. */
        }
        {pendingCount > 0 && (
          <Tooltip title="Accept the actions Copilot has proposed">
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
              Accept {pendingCount} action{pendingCount === 1 ? "" : "s"}
            </Button>
          </Tooltip>
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
          onClick={() => setCopilotOpen(false)}
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
