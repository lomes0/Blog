"use client";
import { useState } from "react";
import { useMenuState } from "@/hooks/useMenuState";
import {
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Tooltip,
} from "@mui/material";
import { FilePen, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { CanvasSummary } from "@/types/notes";
import { useRenameBoardState } from "./hooks/useRenameBoardState";
import { useAddBoardState } from "./hooks/useAddBoardState";
import { ICON_SIZE } from "@/theme/icons";

interface BoardSelectorProps {
  boards: CanvasSummary[];
  activeCanvasId: string | null;
  onSelectBoard: (id: string) => void;
  onCreateBoard: (name: string) => void;
  onRenameBoard: (id: string, name: string) => void;
  onDeleteBoard: (id: string) => void;
}

interface BoardContextMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  onRenameClick: () => void;
  onDeleteClick: () => void;
  canDelete: boolean;
}

function BoardContextMenu({
  anchorEl,
  open,
  onClose,
  onRenameClick,
  onDeleteClick,
  canDelete,
}: BoardContextMenuProps) {
  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      slotProps={{ paper: { elevation: 2 } }}
    >
      <MenuItem onClick={onRenameClick} dense>
        <FilePen size={16} style={{ marginRight: 8 }} />
        Rename
      </MenuItem>
      <MenuItem
        onClick={onDeleteClick}
        dense
        disabled={!canDelete}
        sx={{ color: canDelete ? "error.main" : undefined }}
      >
        <Trash2 size={16} style={{ marginRight: 8 }} />
        Delete
      </MenuItem>
    </Menu>
  );
}

interface AddBoardSectionProps {
  addingBoard: boolean;
  newBoardName: string;
  newBoardError: string;
  addInputRef: React.RefObject<HTMLInputElement | null>;
  onNameChange: (v: string) => void;
  onErrorClear: () => void;
  onSubmit: () => void;
  onCancel: () => void;
  onAddClick: () => void;
}

function AddBoardSection({
  addingBoard,
  newBoardName,
  newBoardError,
  addInputRef,
  onNameChange,
  onErrorClear,
  onSubmit,
  onCancel,
  onAddClick,
}: AddBoardSectionProps) {
  if (addingBoard) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          flexShrink: 0,
          ml: 0.5,
        }}
      >
        <TextField
          inputRef={addInputRef}
          value={newBoardName}
          size="small"
          placeholder="Board name"
          error={!!newBoardError}
          autoFocus
          onChange={(e) => {
            onNameChange(e.target.value);
            if (newBoardError) onErrorClear();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
            if (e.key === "Escape") onCancel();
          }}
          sx={{
            width: 140,
            "& .MuiInputBase-input": { py: 0.5, typography: "dense" },
          }}
        />
        <Button
          size="small"
          variant="contained"
          disableElevation
          onClick={onSubmit}
          sx={{
            minWidth: "auto",
            px: 1.5,
            py: 0.5,
            fontSize: "0.75rem",
            lineHeight: 1.5,
          }}
        >
          Add
        </Button>
        <Button
          size="small"
          onClick={onCancel}
          sx={{
            minWidth: "auto",
            px: 1,
            py: 0.5,
            fontSize: "0.75rem",
            lineHeight: 1.5,
          }}
        >
          Cancel
        </Button>
      </Box>
    );
  }
  return (
    <Tooltip title="New board">
      <IconButton size="small" onClick={onAddClick} sx={{ flexShrink: 0 }}>
        <Plus size={ICON_SIZE.dense} />
      </IconButton>
    </Tooltip>
  );
}

export default function BoardSelector({
  boards,
  activeCanvasId,
  onSelectBoard,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
}: BoardSelectorProps) {
  const { anchorEl: menuAnchor, menuOpen, openMenu, closeMenu } =
    useMenuState();
  const [menuBoardId, setMenuBoardId] = useState<string | null>(null);

  const handleMenuOpen = (
    e: React.MouseEvent<HTMLElement>,
    boardId: string,
  ) => {
    e.stopPropagation();
    openMenu(e);
    setMenuBoardId(boardId);
  };

  const handleMenuClose = () => {
    closeMenu();
    setMenuBoardId(null);
  };

  const {
    renamingId,
    renameValue,
    renameInputRef,
    setRenameValue,
    handleRenameClick,
    handleRenameSubmit,
    cancelRename,
  } = useRenameBoardState(onRenameBoard, handleMenuClose);

  const {
    addingBoard,
    newBoardName,
    newBoardError,
    addInputRef,
    setNewBoardName,
    setNewBoardError,
    handleAddClick,
    handleAddSubmit,
    handleAddCancel,
  } = useAddBoardState(onCreateBoard);

  const handleDeleteClick = () => {
    if (menuBoardId && boards.length > 1) {
      const board = boards.find((b) => b.id === menuBoardId);
      if (
        board &&
        window.confirm(
          `Delete board "${board.name}"? All notes on this board will be permanently lost.`,
        )
      ) {
        onDeleteBoard(menuBoardId);
      }
    }
    handleMenuClose();
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <Tabs
        value={activeCanvasId ?? false}
        onChange={(_e, v) => v && onSelectBoard(v as string)}
        variant="scrollable"
        scrollButtons={false}
        sx={{
          minHeight: 32,
          flexShrink: 1,
          minWidth: 0,
          "& .MuiTabs-indicator": { height: 2, borderRadius: "2px 2px 0 0" },
          "& .MuiTabs-flexContainer": { gap: 0.25 },
          "& .MuiTab-root": {
            minHeight: 32,
            px: 1.5,
            py: 0,
            typography: "dense",
            fontWeight: 500,
            textTransform: "none",
            letterSpacing: 0,
            minWidth: "auto",
          },
        }}
      >
        {boards.map((board) => (
          <Tab
            key={board.id}
            value={board.id}
            label={renamingId === board.id
              ? (
                <TextField
                  inputRef={renameInputRef}
                  value={renameValue}
                  size="small"
                  variant="standard"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameSubmit();
                    if (e.key === "Escape") cancelRename();
                    e.stopPropagation();
                  }}
                  onBlur={handleRenameSubmit}
                  InputProps={{
                    disableUnderline: false,
                    sx: { typography: "dense", fontWeight: 500, width: 100 },
                  }}
                />
              )
              : (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                  <span>{board.name}</span>
                  {activeCanvasId === board.id && (
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, board.id)}
                      sx={{
                        p: "2px",
                        ml: 0.25,
                        opacity: 0.5,
                        "&:hover": { opacity: 1 },
                      }}
                    >
                      <MoreHorizontal size={ICON_SIZE.inline} />
                    </IconButton>
                  )}
                </Box>
              )}
          />
        ))}
      </Tabs>

      <AddBoardSection
        addingBoard={addingBoard}
        newBoardName={newBoardName}
        newBoardError={newBoardError}
        addInputRef={addInputRef}
        onNameChange={setNewBoardName}
        onErrorClear={() => setNewBoardError("")}
        onSubmit={handleAddSubmit}
        onCancel={handleAddCancel}
        onAddClick={handleAddClick}
      />

      <BoardContextMenu
        anchorEl={menuAnchor}
        open={menuOpen}
        onClose={handleMenuClose}
        onRenameClick={() => handleRenameClick(boards, menuBoardId)}
        onDeleteClick={handleDeleteClick}
        canDelete={boards.length > 1}
      />
    </Box>
  );
}
