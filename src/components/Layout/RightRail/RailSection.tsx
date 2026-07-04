"use client";
import { useState } from "react";
import { Box, Chip, Collapse, IconButton, Typography } from "@mui/material";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";

interface RailSectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  icon: React.ReactNode;
  iconLabel: string;
  children: React.ReactNode;
}

const RailSection: React.FC<RailSectionProps> = ({
  title,
  count,
  defaultOpen = true,
  icon,
  iconLabel,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Box
      role="region"
      aria-label={iconLabel}
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1.5,
        overflow: "hidden",
      }}
    >
      <Box
        component="button"
        onClick={() => setOpen((p) => !p)}
        sx={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          gap: 0.75,
          px: 1.25,
          py: 0.875,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "text.primary",
          bgcolor: "background.paper",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        <Box sx={{ color: "text.secondary", display: "flex", flexShrink: 0 }}>
          {icon}
        </Box>
        <Typography
          variant="caption"
          fontWeight={700}
          sx={{ flex: 1, textAlign: "left", lineHeight: 1.2 }}
        >
          {title}
        </Typography>
        {count !== undefined && (
          <Chip
            label={count}
            size="small"
            sx={{
              height: 16,
              typography: "micro",
              "& .MuiChip-label": { px: 0.75 },
            }}
          />
        )}
        <IconButton
          component="span"
          size="small"
          tabIndex={-1}
          aria-hidden="true"
          sx={{ p: 0, pointerEvents: "none" }}
        >
          {open
            ? <ChevronUp size={ICON_SIZE.dense} />
            : <ChevronDown size={ICON_SIZE.dense} />}
        </IconButton>
      </Box>
      <Collapse in={open}>
        <Box
          sx={{ px: 1.25, pb: 1.25, pt: 0.5, bgcolor: "background.default" }}
        >
          {children}
        </Box>
      </Collapse>
    </Box>
  );
};

export default RailSection;
