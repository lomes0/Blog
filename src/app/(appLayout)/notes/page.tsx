"use client";
import NotesCanvas, { NotesCanvasHandle } from "@/components/NotesCanvas";
import BoardSelector from "@/components/NotesCanvas/BoardSelector";
import ZoomControls from "@/components/NotesCanvas/ZoomControls";
import {
  NOTE_COLOR_LIST,
  NOTE_COLORS,
  NOTE_SWATCH_COLORS,
} from "@/components/NotesCanvas/noteColors";
import { useNotesBoards } from "@/hooks/useNotesBoards";
import { useNotesZoom } from "@/hooks/useNotesZoom";
import { Box, Divider, Popover, Tooltip } from "@mui/material";
import { SquarePen, StickyNote } from "lucide-react";
import { useRef, useState } from "react";
import { NotesClipboardProvider } from "@/contexts/NotesClipboardContext";
import { ICON_SIZE } from "@/theme/icons";

export default function NotesPage() {
  const {
    boards,
    activeCanvasId,
    setActiveCanvasId,
    createBoard,
    renameBoard,
    deleteBoard,
  } = useNotesBoards();

  const zoom = useNotesZoom(activeCanvasId);
  const canvasRef = useRef<NotesCanvasHandle>(null);
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);

  return (
    <NotesClipboardProvider>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
        }}
      >
        {/* Board selector header — visually distinct from canvas */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 2,
            py: 1,
            bgcolor: "background.paper",
            flexShrink: 0,
          }}
        >
          <StickyNote
            size={ICON_SIZE.dense}
            style={{ color: "var(--mui-palette-text-secondary)" }}
          />
          <BoardSelector
            boards={boards}
            activeCanvasId={activeCanvasId}
            onSelectBoard={setActiveCanvasId}
            onCreateBoard={createBoard}
            onRenameBoard={renameBoard}
            onDeleteBoard={deleteBoard}
          />

          <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />

          {/* Add note button with color picker */}
          <Tooltip title="Add note">
            <Box
              component="button"
              onClick={(e: React.MouseEvent<HTMLElement>) =>
                setColorAnchor(e.currentTarget)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 1.25,
                height: 28,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: "14px",
                bgcolor: "action.hover",
                cursor: "pointer",
                flexShrink: 0,
                typography: "dense",
                fontWeight: 500,
                color: "text.secondary",
                "&:hover": {
                  bgcolor: "action.selected",
                  color: "text.primary",
                },
                transition: "all 0.15s ease",
              }}
            >
              <SquarePen size={ICON_SIZE.inline} />
              Add note
            </Box>
          </Tooltip>

          <Popover
            open={!!colorAnchor}
            anchorEl={colorAnchor}
            onClose={() => setColorAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            slotProps={{ paper: { elevation: 2, sx: { mt: 0.5 } } }}
          >
            <Box sx={{ display: "flex", gap: 0.75, p: 1 }}>
              {NOTE_COLOR_LIST.map((color) => (
                <Tooltip key={color.value} title={color.name}>
                  <Box
                    component="button"
                    onClick={() => {
                      canvasRef.current?.addNote(color.value);
                      setColorAnchor(null);
                    }}
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: NOTE_COLORS[color.value],
                      border: "2px solid",
                      borderColor: "transparent",
                      cursor: "pointer",
                      p: 0,
                      outline: "none",
                      transition: "all 0.15s ease",
                      "&:hover": {
                        borderColor: NOTE_SWATCH_COLORS[color.value],
                        transform: "scale(1.2)",
                        boxShadow: `0 2px 8px ${
                          NOTE_SWATCH_COLORS[color.value]
                        }88`,
                      },
                    }}
                  />
                </Tooltip>
              ))}
            </Box>
          </Popover>

          <ZoomControls zoom={zoom} />
        </Box>

        {/* Canvas area */}
        <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <NotesCanvas
            ref={canvasRef}
            canvasId={activeCanvasId}
            scale={zoom.scale}
            onZoomIn={zoom.zoomIn}
            onZoomOut={zoom.zoomOut}
            onResetZoom={zoom.resetZoom}
          />
        </Box>
      </Box>
    </NotesClipboardProvider>
  );
}
