"use client";
import { Box, Chip, Typography } from "@mui/material";

const QUICK_ACTIONS = [
  {
    label: "Improve writing",
    prompt: "Improve the writing quality of this document.",
  },
  { label: "Fix grammar", prompt: "Fix any grammar and spelling mistakes." },
  {
    label: "Make shorter",
    prompt: "Shorten this document while keeping all key information.",
  },
  {
    label: "Add examples",
    prompt: "Add concrete examples to illustrate the main points.",
  },
  { label: "Summarize", prompt: "Summarize this document in 3 bullet points." },
];

interface QuickActionsProps {
  onSelect: (prompt: string) => void;
}

const QuickActions: React.FC<QuickActionsProps> = ({ onSelect }) => (
  <Box>
    <Typography
      variant="caption"
      color="text.secondary"
      display="block"
      sx={{ mb: 1 }}
    >
      Quick actions
    </Typography>
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
      {QUICK_ACTIONS.map((action) => (
        <Chip
          key={action.label}
          label={action.label}
          size="small"
          variant="outlined"
          onClick={() => onSelect(action.prompt)}
          sx={{ cursor: "pointer" }}
        />
      ))}
    </Box>
  </Box>
);

export default QuickActions;
