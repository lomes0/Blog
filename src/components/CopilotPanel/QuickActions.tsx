"use client";
import { Box, Chip } from "@mui/material";
import { ListPlus, SpellCheck, Text } from "lucide-react";

const QUICK_ACTIONS = [
  {
    label: "Summarize doc",
    prompt: "Summarize this document in 3 bullet points.",
    icon: <Text size={13} />,
  },
  {
    label: "Fix grammar",
    prompt: "Fix any grammar and spelling mistakes.",
    icon: <SpellCheck size={13} />,
  },
  {
    label: "Add section",
    prompt: "Suggest and add a new section to this document.",
    icon: <ListPlus size={13} />,
  },
];

interface QuickActionsProps {
  onSelect: (prompt: string) => void;
}

const QuickActions: React.FC<QuickActionsProps> = ({ onSelect }) => (
  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
    {QUICK_ACTIONS.map((action) => (
      <Chip
        key={action.label}
        label={action.label}
        size="small"
        variant="outlined"
        icon={action.icon}
        onClick={() => onSelect(action.prompt)}
        sx={{ cursor: "pointer", typography: "caption" }}
      />
    ))}
  </Box>
);

export default QuickActions;
