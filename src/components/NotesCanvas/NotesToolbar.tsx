"use client";
import { Box, SpeedDial, SpeedDialAction, SpeedDialIcon } from "@mui/material";
import { Palette, Plus } from "lucide-react";
import { useState } from "react";
import { NOTE_COLOR_LIST, NOTE_COLORS } from "./noteColors";

interface NotesToolbarProps {
  onAddNote: (color: string) => void;
  onClearAll?: () => void;
}

export default function NotesToolbar({
  onAddNote,
  onClearAll: _onClearAll,
}: NotesToolbarProps) {
  const [open, setOpen] = useState(false);

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 1000,
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 1,
      }}
    >
      {/* Speed Dial for Color Selection */}
      <SpeedDial
        ariaLabel="Add note"
        icon={<SpeedDialIcon icon={<Plus />} openIcon={<Palette />} />}
        onClose={() => setOpen(false)}
        onOpen={() => setOpen(true)}
        open={open}
        direction="up"
        FabProps={{ size: "small" }}
        sx={{
          "& .MuiFab-primary": {
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            boxShadow: "0 4px 20px rgba(102, 126, 234, 0.4)",
            "&:hover": {
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              boxShadow: "0 6px 30px rgba(102, 126, 234, 0.5)",
            },
          },
        }}
      >
        {NOTE_COLOR_LIST.map((color) => (
          <SpeedDialAction
            key={color.value}
            icon={
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: NOTE_COLORS[color.value],
                  border: "2px solid white",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                }}
              />
            }
            tooltipTitle={color.name}
            onClick={() => {
              onAddNote(color.value);
              setOpen(false);
            }}
            sx={{
              "& .MuiSpeedDialAction-fab": {
                background: "white",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                "&:hover": {
                  background: "white",
                  transform: "scale(1.1)",
                },
              },
            }}
          />
        ))}
      </SpeedDial>
    </Box>
  );
}
