"use client";
import { Note } from "@/types/notes";
import { DraggableData, Rnd, RndDragEvent, RndResizeCallback } from "react-rnd";
import { EditorState, LexicalEditor } from "lexical";
import { editorConfig } from "@/editor/config";
import { useCallback, useRef, useState } from "react";
import { useMenuState } from "@/hooks/useMenuState";
import {
  Box,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Popover,
  TextField,
} from "@mui/material";
import { Copy, MoreHorizontal, Palette, Scissors, Trash2 } from "lucide-react";
import { useNotesClipboard } from "@/contexts/NotesClipboardContext";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorPlugins } from "@/editor/plugins";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import {
  NOTE_COLOR_LIST,
  NOTE_COLORS,
  NOTE_SWATCH_COLORS,
  NoteColorKey,
} from "./noteColors";
import { ICON_SIZE } from "@/theme/icons";

const MIN_NOTE_WIDTH = 160; // px
const MIN_NOTE_HEIGHT = 120; // px

interface DraggableNoteProps {
  note: Note;
  onUpdate: (id: string, updates: Partial<Note>) => void;
  onDelete: (id: string) => void;
  onFocus: (id: string) => void;
  scale?: number;
}

export default function DraggableNote({
  note,
  onUpdate,
  onDelete,
  onFocus,
  scale = 1,
}: DraggableNoteProps) {
  const editorRef = useRef<LexicalEditor | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [title, setTitle] = useState(note.title || "");
  const {
    anchorEl: moreAnchor,
    menuOpen: moreMenuOpen,
    openMenu: openMoreMenu,
    closeMenu: closeMoreMenu,
  } = useMenuState();
  const {
    anchorEl: colorAnchor,
    menuOpen: colorMenuOpen,
    openMenu: openColorMenu,
    closeMenu: closeColorMenu,
  } = useMenuState();
  const { copyNote, cutNote } = useNotesClipboard();

  const handleEditorChange = useCallback(
    (editorState: EditorState, _editor: LexicalEditor) => {
      const serialized = JSON.stringify(editorState);
      onUpdate(note.id, { content: serialized });
    },
    [onUpdate, note.id],
  );

  const initialConfig = {
    ...editorConfig,
    editorState: note.content || undefined,
  };

  const handleDragStop = useCallback(
    (_e: RndDragEvent, d: DraggableData) => {
      onUpdate(note.id, { position: { x: d.x, y: d.y } });
    },
    [onUpdate, note.id],
  );

  const handleResizeStop = useCallback<RndResizeCallback>(
    (_e, _direction, ref, _delta, position) => {
      onUpdate(note.id, {
        size: { width: ref.offsetWidth, height: ref.offsetHeight },
        position,
      });
    },
    [onUpdate, note.id],
  );

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onFocus(note.id);
  }, [onFocus, note.id]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  const handleTitleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = event.target.value;
      setTitle(newTitle);
      onUpdate(note.id, { title: newTitle });
    },
    [onUpdate, note.id],
  );

  const handleCut = useCallback(() => {
    cutNote(note, onDelete);
    closeMoreMenu();
  }, [cutNote, note, onDelete, closeMoreMenu]);

  const handleCopy = useCallback(() => {
    copyNote(note);
    closeMoreMenu();
  }, [copyNote, note, closeMoreMenu]);

  const handleDelete = useCallback(() => {
    onDelete(note.id);
    closeMoreMenu();
  }, [onDelete, note.id, closeMoreMenu]);

  const handleColorChange = useCallback(
    (color: NoteColorKey) => {
      onUpdate(note.id, { color });
      closeColorMenu();
    },
    [onUpdate, note.id, closeColorMenu],
  );

  const handleOpenColorMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      openColorMenu(e);
    },
    [openColorMenu],
  );

  const handleOpenMoreMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      openMoreMenu(e);
    },
    [openMoreMenu],
  );

  const handleStopPropagation = useCallback(
    (e: React.SyntheticEvent) => e.stopPropagation(),
    [],
  );

  const handleCloseColorAnchor = closeColorMenu;
  const handleCloseMoreAnchor = closeMoreMenu;

  return (
    <Rnd
      size={{ width: note.size.width, height: note.size.height }}
      position={{ x: note.position.x, y: note.position.y }}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      minWidth={MIN_NOTE_WIDTH}
      minHeight={MIN_NOTE_HEIGHT}
      bounds="parent"
      dragHandleClassName="drag-handle"
      scale={scale}
      style={{ zIndex: note.zIndex }}
      enableResizing={{
        bottom: true,
        bottomRight: true,
        right: true,
        bottomLeft: true,
        left: true,
        top: true,
        topLeft: true,
        topRight: true,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          height: "100%",
          background: NOTE_COLORS[note.color as NoteColorKey] ||
            NOTE_COLORS.yellow,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: "6px",
          border: isFocused
            ? (theme) =>
              `2px solid rgba(${theme.vars.palette.primary.mainChannel} / 0.5)`
            : "1px solid rgba(0, 0, 0, 0.1)",
          boxShadow: isFocused
            ? (theme) =>
              `0 8px 32px rgba(0,0,0,0.12), 0 0 0 3px rgba(${theme.vars.palette.primary.mainChannel} / 0.08), inset 0 1px 0 rgba(255,255,255,0.5)`
            : "0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
          transition: "box-shadow 0.2s ease, border-color 0.2s ease",
          "&:hover": {
            boxShadow:
              "0 4px 16px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
          },
        }}
        onMouseDown={handleFocus}
      >
        {/* Header */}
        <Box
          className="drag-handle"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            padding: "6px 8px",
            backgroundColor: "rgba(255, 255, 255, 0.25)",
            cursor: "move",
            userSelect: "none",
            borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
            minHeight: "28px",
            transition: "background-color 0.2s ease",
            "&:hover": {
              backgroundColor: "rgba(255, 255, 255, 0.35)",
            },
          }}
        >
          <TextField
            value={title}
            onChange={handleTitleChange}
            placeholder="Untitled"
            variant="standard"
            fullWidth
            onClick={handleStopPropagation}
            onMouseDown={handleStopPropagation}
            InputProps={{
              disableUnderline: true,
              sx: {
                typography: "dense",
                fontWeight: 500,
                color: "rgba(0, 0, 0, 0.75)",
                "& input": {
                  padding: 0,
                  cursor: "text",
                  "&::placeholder": {
                    color: "rgba(0, 0, 0, 0.3)",
                    opacity: 1,
                  },
                },
              },
            }}
          />
          <IconButton
            size="small"
            onClick={handleOpenColorMenu}
            onMouseDown={handleStopPropagation}
            sx={{
              padding: "3px",
              flexShrink: 0,
              opacity: 0.45,
              transition: "opacity 0.2s ease",
              "&:hover": { opacity: 1 },
            }}
          >
            <Palette size={ICON_SIZE.inline} />
          </IconButton>
          <IconButton
            size="small"
            onClick={handleOpenMoreMenu}
            onMouseDown={handleStopPropagation}
            sx={{
              padding: "3px",
              flexShrink: 0,
              opacity: 0.45,
              transition: "opacity 0.2s ease",
              "&:hover": { opacity: 1 },
            }}
          >
            <MoreHorizontal size={ICON_SIZE.inline} />
          </IconButton>
        </Box>

        {/* Editor Content */}
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            padding: "10px",
            backgroundColor: "rgba(255, 255, 255, 0.3)",
            "& .editor-input": {
              minHeight: "100%",
              outline: "none",
              fontSize: "14px",
              lineHeight: "1.6",
              color: "rgba(0, 0, 0, 0.87)",
            },
            "& p": {
              marginBottom: "8px",
            },
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
        >
          <LexicalComposer initialConfig={initialConfig}>
            <EditorPlugins
              onChange={handleEditorChange}
              contentEditable={
                <ContentEditable
                  className="editor-input"
                  ariaLabel="note editor"
                />
              }
            />
            <EditorRefPlugin editorRef={editorRef} />
          </LexicalComposer>
        </Box>

        {/* Color picker */}
        <Popover
          open={colorMenuOpen}
          anchorEl={colorAnchor}
          onClose={handleCloseColorAnchor}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          onClick={handleStopPropagation}
          slotProps={{ paper: { elevation: 3, sx: { p: 1 } } }}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 22px)",
              gap: 0.75,
            }}
          >
            {NOTE_COLOR_LIST.map(({ value }) => (
              <Box
                key={value}
                onClick={() => handleColorChange(value)}
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: NOTE_SWATCH_COLORS[value],
                  border: note.color === value
                    ? "2px solid rgba(var(--mui-palette-primary-mainChannel) / 0.85)"
                    : "2px solid rgba(0,0,0,0.12)",
                  cursor: "pointer",
                  transition: "transform 0.1s ease",
                  "&:hover": { transform: "scale(1.2)" },
                }}
              />
            ))}
          </Box>
        </Popover>

        {/* Note actions menu */}
        <Menu
          anchorEl={moreAnchor}
          open={moreMenuOpen}
          onClose={handleCloseMoreAnchor}
          onClick={handleStopPropagation}
        >
          <MenuItem onClick={handleCut} dense>
            <Scissors size={ICON_SIZE.dense} style={{ marginRight: 8 }} />
            Cut
          </MenuItem>
          <MenuItem onClick={handleCopy} dense>
            <Copy size={ICON_SIZE.dense} style={{ marginRight: 8 }} />
            Copy
          </MenuItem>
          <Divider />
          <MenuItem onClick={handleDelete} dense sx={{ color: "error.main" }}>
            <Trash2 size={ICON_SIZE.dense} style={{ marginRight: 8 }} />
            Delete
          </MenuItem>
        </Menu>
      </Paper>
    </Rnd>
  );
}
