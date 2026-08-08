"use client";
import { Box, Chip } from "@mui/material";
import { type AIActionId, getAIAction } from "@/lib/ai";
import { AI_ACTION_ICON } from "@/lib/ai/actionIcons";
import { ICON_SIZE } from "@/theme/icons";

/**
 * Which actions the empty state features, and in what order.
 *
 * A curated shortlist, not a fourth definition of anything: the label and the
 * prompt still come from the registry, and this only picks the few that fit a
 * chip row. Typed against {@link AIActionId}, so retiring an action breaks the
 * build here rather than rendering a blank chip.
 */
const FEATURED: AIActionId[] = ["summarize", "fix", "section"];

interface QuickActionsProps {
  onSelect: (prompt: string) => void;
}

const QuickActions: React.FC<QuickActionsProps> = ({ onSelect }) => (
  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
    {FEATURED.map((id) => {
      const action = getAIAction(id);
      if (!action) {
        return null;
      }
      const Icon = AI_ACTION_ICON[id];
      return (
        <Chip
          key={id}
          label={action.label}
          size="small"
          variant="outlined"
          icon={<Icon size={ICON_SIZE.inline} />}
          onClick={() => onSelect(action.instruction)}
          sx={{ cursor: "pointer", typography: "caption" }}
        />
      );
    })}
  </Box>
);

export default QuickActions;
