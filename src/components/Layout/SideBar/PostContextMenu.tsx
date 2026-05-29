import React from "react";
import { ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import { Theme } from "@mui/material/styles";
import { FilePen, Pencil, Trash2 } from "lucide-react";

interface ContextMenuState {
  mouseX: number;
  mouseY: number;
  postId: string;
}

interface PostContextMenuProps {
  contextMenu: ContextMenuState | null;
  onClose: () => void;
  onEdit: (postId: string) => void;
  onRename: (postId: string) => void;
  onDelete: (postId: string) => void;
}

const menuItemSx = {
  py: 0.75,
  px: 1.75,
  gap: 1.25,
  fontSize: "0.875rem",
  "&:hover": { backgroundColor: "action.hover" },
};

const borderBottomSx = {
  borderBottom: (theme: Theme) =>
    theme.palette.mode === "dark"
      ? "1px solid rgba(255, 255, 255, 0.06)"
      : "1px solid rgba(0, 0, 0, 0.04)",
};

export const PostContextMenu: React.FC<PostContextMenuProps> = ({
  contextMenu,
  onClose,
  onEdit,
  onRename,
  onDelete,
}) => {
  return (
    <Menu
      open={contextMenu !== null}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={contextMenu !== null
        ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
        : undefined}
      slotProps={{
        paper: {
          elevation: 2,
          sx: {
            minWidth: 130,
            borderRadius: 1,
            mt: 0.5,
            bgcolor: (theme) =>
              theme.palette.mode === "dark"
                ? "rgba(30, 30, 30, 0.95)"
                : "rgba(250, 250, 250, 0.95)",
            backdropFilter: "blur(8px)",
          },
        },
      }}
    >
      <MenuItem
        onClick={() => contextMenu && onEdit(contextMenu.postId)}
        sx={{ ...menuItemSx, ...borderBottomSx }}
      >
        <ListItemIcon sx={{ minWidth: "auto !important" }}>
          <Pencil size={18} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: "0.875rem" }}>
          Edit
        </ListItemText>
      </MenuItem>
      <MenuItem
        onClick={() => contextMenu && onRename(contextMenu.postId)}
        sx={{ ...menuItemSx, ...borderBottomSx }}
      >
        <ListItemIcon sx={{ minWidth: "auto !important" }}>
          <FilePen size={18} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: "0.875rem" }}>
          Rename
        </ListItemText>
      </MenuItem>
      <MenuItem
        onClick={() => contextMenu && onDelete(contextMenu.postId)}
        sx={menuItemSx}
      >
        <ListItemIcon sx={{ minWidth: "auto !important" }}>
          <Trash2 size={18} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: "0.875rem" }}>
          Delete
        </ListItemText>
      </MenuItem>
    </Menu>
  );
};
