import React from "react";
import { ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import { FilePen, Trash2 } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";

interface ProjectContextMenuState {
  mouseX: number;
  mouseY: number;
  projectId: string;
}

interface ProjectContextMenuProps {
  contextMenu: ProjectContextMenuState | null;
  onClose: () => void;
  onRename: (projectId: string) => void;
  onDelete: (projectId: string) => void;
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

/**
 * Right-click menu for a project section header. A project has no editor
 * document or detail page, so it only offers inline Rename and Delete (which
 * frees its series back to the root list) — no "Edit". Mirrors
 * {@link SeriesContextMenu} otherwise.
 */
export const ProjectContextMenu: React.FC<ProjectContextMenuProps> = ({
  contextMenu,
  onClose,
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
        onClick={() => contextMenu && onRename(contextMenu.projectId)}
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
        onClick={() => contextMenu && onDelete(contextMenu.projectId)}
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
