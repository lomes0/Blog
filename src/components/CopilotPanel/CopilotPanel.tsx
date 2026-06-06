"use client";
import { useRef, useState } from "react";
import { Box, Button, IconButton, Tooltip, Typography } from "@mui/material";
import { History, Plus, X } from "lucide-react";
import { actions, documentsSelectors, useDispatch, useSelector } from "@/store";
import { AI_MODELS } from "@/lib/ai/models";
import { useAIModel } from "@/contexts/AIModelContext";
import CopilotChat from "./CopilotChat";

interface CopilotPanelProps {
  documentId: string;
}

const CopilotPanel: React.FC<CopilotPanelProps> = ({ documentId }) => {
  const dispatch = useDispatch();

  const { llm: llmConfig, setLlm: setLlmConfig } = useAIModel();

  const [chatKey, setChatKey] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const acceptAllRef = useRef<(() => void) | null>(null);

  const doc = useSelector((state) =>
    documentsSelectors.selectById(state, documentId)
  );
  const documentTitle = doc?.cloud?.name ?? doc?.local?.name ?? "Untitled";
  const currentModel = AI_MODELS.find((m) => m.id === llmConfig.model);

  const handleAcceptAll = () => {
    acceptAllRef.current?.();
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
        bgcolor: "background.paper",
        flexShrink: 0,
      }}
    >
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
        <IconButton
          size="small"
          onClick={() => setChatKey((k) => k + 1)}
          aria-label="New conversation"
        >
          <Plus size={16} />
        </IconButton>

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
              fontSize: "0.7rem",
              py: 0.25,
              px: 1,
              flexShrink: 0,
            }}
          >
            Accept all
          </Button>
        )}

        <Tooltip title="Conversation history (coming soon)">
          <span>
            <IconButton size="small" disabled aria-label="Conversation history">
              <History size={16} />
            </IconButton>
          </span>
        </Tooltip>
        <IconButton
          size="small"
          onClick={() => dispatch(actions.setCopilotOpen(false))}
          aria-label="Close Copilot"
        >
          <X size={16} />
        </IconButton>
      </Box>

      <CopilotChat
        key={chatKey}
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
