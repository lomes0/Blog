"use client";
import { NoteFrame } from "@/types/notes";
import { DraggableData, Rnd, RndDragEvent, RndResizeCallback } from "react-rnd";
import { useCallback, useState } from "react";
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
  Typography,
} from "@mui/material";
import { Copy, MoreHorizontal, Palette, Scissors, Trash2 } from "lucide-react";
import {
  NOTE_COLOR_LIST,
  NOTE_COLORS,
  NOTE_SWATCH_COLORS,
  NoteColorKey,
} from "./noteColors";
import { ICON_SIZE } from "@/theme/icons";

export const MIN_NOTE_WIDTH = 160; // px
export const MIN_NOTE_HEIGHT = 120; // px

interface DraggableNoteProps {
  note: NoteFrame;
  onUpdate: (id: string, updates: Partial<NoteFrame>) => void;
  onDelete: (id: string) => void;
  onFocus: (id: string) => void;
  scale?: number;
  /** Renders the note's content editor. Each board supplies its own. */
  children?: React.ReactNode;
  /**
   * Copy/cut this note to the notes clipboard. Omitted entries drop the
   * matching menu item — the two boards serialize note content differently, so
   * neither action can live in this shell.
   */
  onCopy?: () => void;
  onCut?: () => void;
  /** Part of the board's multi-selection. Draws the selected ring. */
  selected?: boolean;
  /**
   * Mouse-down on the note, offered to the board's selection first. Returning
   * true means the selection consumed it — the note then skips its own focus
   * and bring-to-front, because a modifier-click is picking the note out, not
   * opening it.
   */
  onSelect?: (event: React.MouseEvent) => boolean;
  /** Locks position, size and chrome. Used when the host editor isn't editable. */
  readOnly?: boolean;
}

export default function DraggableNote({
  note,
  onUpdate,
  onDelete,
  onFocus,
  scale = 1,
  children,
  onCopy,
  onCut,
  selected = false,
  onSelect,
  readOnly = false,
}: DraggableNoteProps) {
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

  const handleDragStop = useCallback(
    (_e: RndDragEvent, d: DraggableData) => {
      // A click on the header is a zero-distance drag. Writing it back costs a
      // PATCH on `/notes` and an undo step in a document — and a modifier-click
      // for multi-select lands on the header often.
      if (d.x === note.position.x && d.y === note.position.y) return;
      onUpdate(note.id, { position: { x: d.x, y: d.y } });
    },
    [onUpdate, note.id, note.position.x, note.position.y],
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

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (onSelect?.(event)) return;
      handleFocus();
    },
    [onSelect, handleFocus],
  );

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
    onCut?.();
    closeMoreMenu();
  }, [onCut, closeMoreMenu]);

  const handleCopy = useCallback(() => {
    onCopy?.();
    closeMoreMenu();
  }, [onCopy, closeMoreMenu]);

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
      disableDragging={readOnly}
      enableResizing={readOnly ? false : {
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
          // Three states, strongest first. Selected has to out-read focused:
          // a multi-selection is usually looked at while focus sits elsewhere,
          // so it carries a full-strength border plus a wider halo.
          border: selected
            ? (theme) =>
              `2px solid rgba(${theme.vars.palette.primary.mainChannel} / 0.9)`
            : isFocused
            ? (theme) =>
              `2px solid rgba(${theme.vars.palette.primary.mainChannel} / 0.5)`
            : "1px solid rgba(0, 0, 0, 0.1)",
          boxShadow: selected
            ? (theme) =>
              `0 8px 32px rgba(0,0,0,0.14), 0 0 0 5px rgba(${theme.vars.palette.primary.mainChannel} / 0.22), inset 0 1px 0 rgba(255,255,255,0.5)`
            : isFocused
            ? (theme) =>
              `0 8px 32px rgba(0,0,0,0.12), 0 0 0 3px rgba(${theme.vars.palette.primary.mainChannel} / 0.08), inset 0 1px 0 rgba(255,255,255,0.5)`
            : "0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
          transition: "box-shadow 0.2s ease, border-color 0.2s ease",
          "&:hover": {
            boxShadow: selected
              ? (theme) =>
                `0 8px 32px rgba(0,0,0,0.14), 0 0 0 5px rgba(${theme.vars.palette.primary.mainChannel} / 0.22), inset 0 1px 0 rgba(255,255,255,0.5)`
              : "0 4px 16px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.5)",
          },
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Header */}
        <Box
          className={readOnly ? undefined : "drag-handle"}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            padding: "6px 8px",
            backgroundColor: "rgba(255, 255, 255, 0.25)",
            cursor: readOnly ? "default" : "move",
            userSelect: "none",
            borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
            minHeight: "28px",
            transition: "background-color 0.2s ease",
            "&:hover": {
              backgroundColor: readOnly
                ? "rgba(255, 255, 255, 0.25)"
                : "rgba(255, 255, 255, 0.35)",
            },
          }}
        >
          {readOnly
            ? (
              <Typography
                sx={{
                  typography: "dense",
                  fontWeight: 500,
                  color: "rgba(0, 0, 0, 0.75)",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {note.title}
              </Typography>
            )
            : (
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
            )}
          {!readOnly && (
            <>
              <IconButton
                size="small"
                onClick={handleOpenColorMenu}
                onMouseDown={handleStopPropagation}
                aria-label="Note color"
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
                aria-label="Note actions"
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
            </>
          )}
        </Box>

        {/* Editor Content */}
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            padding: "10px",
            backgroundColor: "rgba(255, 255, 255, 0.3)",
            "& .editor-input, & .nested-contentEditable": {
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
          {children}
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
            {NOTE_COLOR_LIST.map(({ name, value }) => (
              <Box
                key={value}
                onClick={() => handleColorChange(value)}
                role="button"
                aria-label={name}
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
          {onCut && (
            <MenuItem onClick={handleCut} dense>
              <Scissors size={ICON_SIZE.dense} style={{ marginRight: 8 }} />
              Cut
            </MenuItem>
          )}
          {onCopy && (
            <MenuItem onClick={handleCopy} dense>
              <Copy size={ICON_SIZE.dense} style={{ marginRight: 8 }} />
              Copy
            </MenuItem>
          )}
          {(onCut || onCopy) && <Divider />}
          <MenuItem onClick={handleDelete} dense sx={{ color: "error.main" }}>
            <Trash2 size={ICON_SIZE.dense} style={{ marginRight: 8 }} />
            Delete
          </MenuItem>
        </Menu>
      </Paper>
    </Rnd>
  );
}
