import React from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { Minus, Plus, Undo } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";

const TimeAdjustColumn: React.FC<{
  label: string;
  tooltipMinus: string;
  tooltipPlus: string;
  onMinus: () => void;
  onPlus: () => void;
}> = ({ label, tooltipMinus, tooltipPlus, onMinus, onPlus }) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 1.0,
    }}
  >
    <Typography
      sx={{
        fontSize: "0.6rem",
        fontWeight: 600,
        color: "text.secondary",
        lineHeight: 1,
        textTransform: "uppercase",
        letterSpacing: "0.02em",
      }}
    >
      {label}
    </Typography>
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
      <Tooltip title={tooltipPlus} arrow placement="left">
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onPlus();
          }}
          sx={{
            width: 22,
            height: 18,
            bgcolor: "action.hover",
            borderRadius: 0.75,
            "&:hover": {
              bgcolor: "success.light",
              color: "success.contrastText",
            },
          }}
        >
          <Plus size={ICON_SIZE.inline} />
        </IconButton>
      </Tooltip>
      <Tooltip title={tooltipMinus} arrow placement="left">
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onMinus();
          }}
          sx={{
            width: 22,
            height: 18,
            bgcolor: "action.hover",
            borderRadius: 0.75,
            "&:hover": { bgcolor: "error.light", color: "error.contrastText" },
          }}
        >
          <Minus size={ICON_SIZE.inline} />
        </IconButton>
      </Tooltip>
    </Box>
  </Box>
);

export const TimeStepperControls: React.FC<{
  onAdjust: (days: number) => void;
  onReset: () => void;
  hasChanges: boolean;
}> = ({ onAdjust, onReset, hasChanges }) => (
  <Box
    sx={{ display: "flex", alignItems: "center", gap: 1, ml: "auto" }}
    onClick={(e) => e.stopPropagation()}
  >
    <Box sx={{ width: 24, display: "flex", justifyContent: "center" }}>
      {hasChanges && (
        <Tooltip title="Reset to original" arrow>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
            sx={{
              width: 24,
              height: 24,
              color: "warning.main",
              "&:hover": { bgcolor: "warning.light", color: "warning.dark" },
            }}
          >
            <Undo size={16} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
    <TimeAdjustColumn
      label="D"
      tooltipMinus="-1 Day"
      tooltipPlus="+1 Day"
      onMinus={() => onAdjust(-1)}
      onPlus={() => onAdjust(1)}
    />
    <TimeAdjustColumn
      label="W"
      tooltipMinus="-1 Week"
      tooltipPlus="+1 Week"
      onMinus={() => onAdjust(-7)}
      onPlus={() => onAdjust(7)}
    />
    <TimeAdjustColumn
      label="M"
      tooltipMinus="-1 Month"
      tooltipPlus="+1 Month"
      onMinus={() => onAdjust(-30)}
      onPlus={() => onAdjust(30)}
    />
  </Box>
);
