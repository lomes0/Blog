import React from "react";
import { ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import { FilePen, Pencil, Trash2 } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import type { ContextMenuState } from "@/hooks/useContextMenu";

interface PostContextMenuProps {
  contextMenu: ContextMenuState<string> | null;
  onClose: () => void;
  onEdit: (postId: string) => void;
  onRename: (postId: string) => void;
  onDelete: (postId: string) => void;
}

const menuItemSx = {
  py: 0.75,
  px: 1.75,
  gap: 1.25,
  typography: "body2",
  "&:hover": { backgroundColor: "action.hover" },
};

const borderBottomSx = {
  borderBottom: "1px solid",
  borderColor: "divider",
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
            borderRadius: 2,
            mt: 0.5,
            bgcolor: "rgba(var(--mui-palette-background-paperChannel) / 0.95)",
            backdropFilter: "blur(8px)",
          },
        },
      }}
    >
      <MenuItem
        onClick={() => contextMenu && onEdit(contextMenu.target)}
        sx={{ ...menuItemSx, ...borderBottomSx }}
      >
        <ListItemIcon sx={{ minWidth: "auto !important" }}>
          <Pencil size={ICON_SIZE.dense} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ variant: "body2" }}>
          Edit
        </ListItemText>
      </MenuItem>
      <MenuItem
        onClick={() => contextMenu && onRename(contextMenu.target)}
        sx={{ ...menuItemSx, ...borderBottomSx }}
      >
        <ListItemIcon sx={{ minWidth: "auto !important" }}>
          <FilePen size={ICON_SIZE.dense} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ variant: "body2" }}>
          Rename
        </ListItemText>
      </MenuItem>
      <MenuItem
        onClick={() => contextMenu && onDelete(contextMenu.target)}
        sx={menuItemSx}
      >
        <ListItemIcon sx={{ minWidth: "auto !important" }}>
          <Trash2 size={ICON_SIZE.dense} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ variant: "body2" }}>
          Delete
        </ListItemText>
      </MenuItem>
    </Menu>
  );
};
