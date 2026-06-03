"use client";
import { Box, IconButton, Typography } from "@mui/material";
import { Bot, X } from "lucide-react";
import { actions, useDispatch } from "@/store";
import CopilotChat from "./CopilotChat";

interface CopilotPanelProps {
  documentId: string;
}

const CopilotPanel: React.FC<CopilotPanelProps> = ({ documentId }) => {
  const dispatch = useDispatch();

  return (
    <Box
      sx={{
        width: 320,
        flexShrink: 0,
        borderLeft: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: "background.paper",
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
        }}
      >
        <Bot size={16} color="var(--mui-palette-primary-main)" />
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          Copilot
        </Typography>
        <IconButton
          size="small"
          onClick={() => dispatch(actions.setCopilotOpen(false))}
          aria-label="Close Copilot"
        >
          <X size={16} />
        </IconButton>
      </Box>

      <CopilotChat documentId={documentId} />
    </Box>
  );
};

export default CopilotPanel;
