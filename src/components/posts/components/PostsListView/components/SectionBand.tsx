import React from "react";
import { Box, Typography } from "@mui/material";

interface SectionBandProps {
  label: string;
  count: number;
  color: string;
}

export function SectionBand({ label, count, color }: SectionBandProps) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        mb: 0.5,
        mt: 1,
        px: 1,
      }}
    >
      <Typography
        component="span"
        variant="micro"
        sx={{
          fontWeight: 700,
          letterSpacing: "0.075em",
          textTransform: "uppercase",
          color,
          whiteSpace: "nowrap",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        {label} · {count}
      </Typography>
      <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
    </Box>
  );
}
