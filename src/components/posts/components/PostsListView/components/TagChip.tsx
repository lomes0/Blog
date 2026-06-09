import React from "react";
import { Box, Chip, Typography } from "@mui/material";
import { TagStyle } from "../types";

interface TagChipProps {
  label: string;
  color?: string;
  tagStyle: TagStyle;
}

export function TagChip({ label, color = "#999", tagStyle }: TagChipProps) {
  if (tagStyle === "dot") {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: color,
            flexShrink: 0,
          }}
        />
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", lineHeight: 1 }}
        >
          {label}
        </Typography>
      </Box>
    );
  }
  return (
    <Chip
      label={label}
      size="small"
      variant={tagStyle === "outline" ? "outlined" : "filled"}
      sx={{
        height: 20,
        typography: "micro",
        "& .MuiChip-label": { px: 1 },
      }}
    />
  );
}
