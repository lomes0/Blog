"use client";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { X } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import type { ViewId } from "./panelState";
import { VIEWS } from "./views";

interface PanelHeaderProps {
  view: ViewId;
  count: number | null;
  onClose: () => void;
}

/**
 * The bar above the panel's content.
 *
 * It owns the title and the close button — the chrome each section used to draw
 * for itself through `RailSection`. That is why the sections are now bare
 * content: with one card per section the title *was* the collapse toggle, and
 * with one view on screen there is nothing left to collapse into.
 */
export default function PanelHeader({ view, count, onClose }: PanelHeaderProps) {
  const { title, icon: Icon } = VIEWS[view];

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        px: 1.25,
        py: 0.875,
        flexShrink: 0,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Box sx={{ color: "text.secondary", display: "flex", flexShrink: 0 }}>
        <Icon size={ICON_SIZE.dense} />
      </Box>
      <Typography
        variant="caption"
        component="h2"
        fontWeight={700}
        sx={{ flex: 1, textAlign: "left", lineHeight: 1.2 }}
        // The heading a screen reader lands on, and what the panel region
        // points at.
        id="rail-panel-title"
      >
        {title}
        {count !== null && count > 0 && (
          <Box
            component="span"
            sx={{ color: "text.disabled", fontWeight: 600, ml: 0.75 }}
          >
            {count}
          </Box>
        )}
      </Typography>
      <Tooltip title={`Close ${title}`} placement="left">
        <IconButton
          size="small"
          onClick={onClose}
          aria-label={`Close ${title}`}
          sx={{ p: 0.25, color: "text.secondary" }}
        >
          <X size={ICON_SIZE.dense} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
