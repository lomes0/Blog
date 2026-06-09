import React from "react";
import { Box, Button, Chip } from "@mui/material";
import { Check, Clock, X } from "lucide-react";
import { type ViewType } from "@/components/shared/ViewToggle";
import { PendingTimeChange } from "@/types/posts";
import { ICON_SIZE } from "@/theme/icons";

const timeEditBtnSx = {
  textTransform: "none",
  fontWeight: 500,
  fontSize: "0.8rem",
  borderRadius: 1.5,
  height: 32,
} as const;

interface SeriesSearchAndControlsProps {
  viewType: ViewType;
  canEdit: boolean;
  isTimeEditMode: boolean;
  isSavingTimeChanges: boolean;
  pendingTimeChanges: Map<string, PendingTimeChange>;
  onToggleTimeEdit: () => void;
  onSaveTimeChanges: () => void;
  onDiscardTimeChanges: () => void;
}

const SeriesSearchAndControls: React.FC<SeriesSearchAndControlsProps> = ({
  viewType,
  canEdit,
  isTimeEditMode,
  isSavingTimeChanges,
  pendingTimeChanges,
  onToggleTimeEdit,
  onSaveTimeChanges,
  onDiscardTimeChanges,
}) => {
  // Nothing to render when not in an editable compact view
  if (!canEdit || viewType !== "compact") return null;

  return (
    <Box
      sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}
    >
      <Button
        size="small"
        variant={isTimeEditMode ? "contained" : "outlined"}
        startIcon={<Clock size={ICON_SIZE.dense} />}
        onClick={onToggleTimeEdit}
        sx={timeEditBtnSx}
      >
        {isTimeEditMode ? "Editing" : "Edit"}
      </Button>

      {isTimeEditMode && (
        <>
          {pendingTimeChanges.size > 0 && (
            <Chip
              size="small"
              label={`${pendingTimeChanges.size} modified`}
              color="warning"
              sx={{ fontSize: "0.75rem", height: 24 }}
            />
          )}
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={<Check size={ICON_SIZE.dense} />}
            onClick={onSaveTimeChanges}
            disabled={pendingTimeChanges.size === 0 || isSavingTimeChanges}
            sx={{ ...timeEditBtnSx, minWidth: 80 }}
          >
            {isSavingTimeChanges ? "Saving..." : "Save"}
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<X size={ICON_SIZE.dense} />}
            onClick={onDiscardTimeChanges}
            disabled={isSavingTimeChanges}
            sx={timeEditBtnSx}
          >
            Cancel
          </Button>
        </>
      )}
    </Box>
  );
};

export default SeriesSearchAndControls;
