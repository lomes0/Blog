"use client";
import { alpha, Box, Typography } from "@mui/material";
import { StickyNote } from "lucide-react";
import StaticNoteCard from "./StaticNoteCard";
import type { NotesCanvas as CanvasData } from "@/types/notes";

const VIRTUAL_CANVAS_WIDTH = 1920;
const VIRTUAL_CANVAS_HEIGHT = 1080;
const PREVIEW_HEIGHT = 260;

interface NotesCanvasPreviewProps {
  canvas: CanvasData | null;
  onClick?: () => void;
}

export default function NotesCanvasPreview(
  { canvas, onClick }: NotesCanvasPreviewProps,
) {
  const previewNotes = canvas?.notes.slice(0, 4) ?? [];
  const remainingCount = (canvas?.notes.length ?? 0) - 4;

  return (
    <Box
      sx={{
        height: 320,
        position: "relative",
        cursor: "pointer",
        borderRadius: 3,
        overflow: "hidden",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        "&:hover": {
          "& .preview-overlay": {
            opacity: 1,
          },
        },
      }}
      onClick={onClick}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <StickyNote size={20} style={{ color: "var(--mui-palette-text-secondary)" }} />
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 500,
              color: "text.primary",
              letterSpacing: "-0.01em",
            }}
          >
            Notes
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          height: 260,
          position: "relative",
          overflow: "hidden",
          borderRadius: 2,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: (theme) =>
              theme.palette.mode === "dark"
                ? `linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
                   linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)`
                : `linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px),
                   linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)`,
            backgroundSize: "20px 20px",
            pointerEvents: "none",
            opacity: 0.5,
          },
        }}
      >
        {previewNotes.length === 0
          ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                gap: 1.5,
                color: "text.secondary",
              }}
            >
              <StickyNote size={48} style={{ opacity: 0.3 }} />
              <Typography variant="body2" sx={{ opacity: 0.7 }}>
                No notes yet
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.5 }}>
                Click to create your first note
              </Typography>
            </Box>
          )
          : (
            <Box
              sx={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  width: `${VIRTUAL_CANVAS_WIDTH}px`,
                  height: `${VIRTUAL_CANVAS_HEIGHT}px`,
                  transform: `scale(${PREVIEW_HEIGHT / VIRTUAL_CANVAS_HEIGHT})`,
                  transformOrigin: "top left",
                }}
              >
                {previewNotes.map((note, index) => (
                  <Box
                    key={note.id}
                    sx={{
                      position: "absolute",
                      left: note.position.x * 2,
                      top: note.position.y * 2,
                      width: note.size.width * 2,
                      height: note.size.height * 2,
                      zIndex: note.zIndex,
                      display: "flex",
                    }}
                  >
                    <StaticNoteCard note={note} index={index} />
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        {previewNotes.length > 0 && remainingCount > 0 && (
          <Box
            sx={{
              position: "absolute",
              bottom: 16,
              right: 16,
              bgcolor: (theme) =>
                alpha(
                  theme.palette.background.paper,
                  theme.palette.mode === "dark" ? 0.9 : 0.95,
                ),
              backdropFilter: "blur(8px)",
              px: 1.5,
              py: 0.75,
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontSize: "11px",
                fontWeight: 600,
                color: "text.secondary",
                letterSpacing: "0.02em",
              }}
            >
              +{remainingCount} more
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
