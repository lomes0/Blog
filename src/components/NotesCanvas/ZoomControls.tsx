"use client";
import { Box, Divider, IconButton, Tooltip, Typography } from "@mui/material";
import { ZoomIn, ZoomOut } from "lucide-react";
import { NotesZoom } from "@/hooks/useNotesZoom";

interface ZoomControlsProps {
  zoom: NotesZoom;
}

export default function ZoomControls({ zoom }: ZoomControlsProps) {
  const { scale, zoomIn, zoomOut, resetZoom, canZoomIn, canZoomOut } = zoom;
  return (
    <>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          bgcolor: "action.hover",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: "14px",
          overflow: "hidden",
          height: 28,
          flexShrink: 0,
        }}
      >
        <Tooltip title="Zoom out (Ctrl + −)">
          <span>
            <IconButton
              size="small"
              onClick={zoomOut}
              disabled={!canZoomOut}
              sx={{ borderRadius: 0, px: 0.5, height: "100%" }}
            >
              <ZoomOut size={15} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Reset zoom (Ctrl + 0)">
          <Typography
            variant="caption"
            onClick={resetZoom}
            sx={{
              px: 0.25,
              minWidth: 32,
              textAlign: "center",
              fontWeight: 600,
              typography: "micro",
              color: "text.secondary",
              cursor: "pointer",
              userSelect: "none",
              lineHeight: 1,
              "&:hover": { color: "text.primary" },
            }}
          >
            {Math.round(scale * 100)}%
          </Typography>
        </Tooltip>
        <Tooltip title="Zoom in (Ctrl + =)">
          <span>
            <IconButton
              size="small"
              onClick={zoomIn}
              disabled={!canZoomIn}
              sx={{ borderRadius: 0, px: 0.5, height: "100%" }}
            >
              <ZoomIn size={15} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </>
  );
}
