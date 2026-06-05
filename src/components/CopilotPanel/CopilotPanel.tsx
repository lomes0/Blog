"use client";
import { useRef, useState } from "react";
import {
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import { Bot, ChevronDown, X } from "lucide-react";
import { actions, useDispatch } from "@/store";
import { AI_MODELS } from "@/lib/ai/models";
import useLocalStorage from "@/hooks/useLocalStorage";
import CopilotChat from "./CopilotChat";

interface CopilotPanelProps {
  documentId: string;
}

const CopilotPanel: React.FC<CopilotPanelProps> = ({ documentId }) => {
  const dispatch = useDispatch();

  const [llmConfig, setLlmConfig] = useLocalStorage("llm", {
    provider: "google",
    model: "gemini-2.5-flash",
  });

  const [modelMenuAnchor, setModelMenuAnchor] = useState<null | HTMLElement>(
    null,
  );
  const [pendingCount, setPendingCount] = useState(0);
  const acceptAllRef = useRef<(() => void) | null>(null);

  const currentModel = AI_MODELS.find((m) => m.id === llmConfig.model);

  const handleModelSelect = (modelId: string, provider: string) => {
    setLlmConfig({ provider, model: modelId });
    setModelMenuAnchor(null);
  };

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
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexShrink: 0,
        }}
      >
        <Bot size={16} color="var(--mui-palette-primary-main)" />
        <Typography variant="subtitle2">Copilot</Typography>

        <Button
          size="small"
          variant="text"
          endIcon={<ChevronDown size={14} />}
          onClick={(e) => setModelMenuAnchor(e.currentTarget)}
          sx={{
            ml: 0.5,
            textTransform: "none",
            fontSize: "0.75rem",
            color: "text.secondary",
            py: 0.25,
            px: 0.75,
            minWidth: 0,
          }}
        >
          {currentModel?.name ?? llmConfig.model}
        </Button>

        <Menu
          anchorEl={modelMenuAnchor}
          open={Boolean(modelMenuAnchor)}
          onClose={() => setModelMenuAnchor(null)}
          slotProps={{ paper: { sx: { minWidth: 200 } } }}
        >
          {AI_MODELS.map((m) => (
            <MenuItem
              key={m.id}
              selected={m.id === llmConfig.model}
              onClick={() => handleModelSelect(m.id, m.provider)}
              sx={{ fontSize: "0.8rem" }}
            >
              {m.name}
            </MenuItem>
          ))}
        </Menu>

        <Box sx={{ flex: 1 }} />

        <Button
          size="small"
          variant="contained"
          disabled={pendingCount === 0}
          onClick={handleAcceptAll}
          sx={{ textTransform: "none", fontSize: "0.75rem", py: 0.25 }}
        >
          Preview & accept
        </Button>

        <IconButton
          size="small"
          onClick={() => dispatch(actions.setCopilotOpen(false))}
          aria-label="Close Copilot"
        >
          <X size={16} />
        </IconButton>
      </Box>

      <CopilotChat
        documentId={documentId}
        llmConfig={llmConfig}
        onRegisterAcceptAll={(fn) => {
          acceptAllRef.current = fn;
        }}
        onPendingCountChange={setPendingCount}
      />
    </Box>
  );
};

export default CopilotPanel;
