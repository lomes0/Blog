import React from "react";
import { ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import { FilePen, Pencil, Trash2 } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import type { ContextMenuState } from "@/hooks/useContextMenu";

interface SidebarContextMenuProps {
  contextMenu: ContextMenuState<string> | null;
  onClose: () => void;
  /**
   * Omitted by rows with no editor document or detail page to open — a project
   * section header offers only Rename and Delete.
   */
  onEdit?: (targetId: string) => void;
  onRename: (targetId: string) => void;
  onDelete: (targetId: string) => void;
}

/**
 * Right-click menu for a sidebar row — a post, a series, or a project section
 * header. The three differed only in which items they showed, so they share one
 * component: an item renders when its handler is supplied, which makes the
 * omission a missing prop rather than a forked file.
 */
export const SidebarContextMenu: React.FC<SidebarContextMenuProps> = ({
  contextMenu,
  onClose,
  onEdit,
  onRename,
  onDelete,
}) => {
  const items = [
    { key: "edit", label: "Edit", Icon: Pencil, handler: onEdit },
    { key: "rename", label: "Rename", Icon: FilePen, handler: onRename },
    { key: "delete", label: "Delete", Icon: Trash2, handler: onDelete },
  ].filter((item) => item.handler !== undefined);

  return (
    <Menu
      open={contextMenu !== null}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={contextMenu !== null
        ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
        : undefined}
    >
      {items.map(({ key, label, Icon, handler }, index) => (
        <MenuItem
          key={key}
          onClick={() => contextMenu && handler?.(contextMenu.target)}
          divider={index < items.length - 1}
        >
          <ListItemIcon>
            <Icon size={ICON_SIZE.dense} />
          </ListItemIcon>
          <ListItemText>{label}</ListItemText>
        </MenuItem>
      ))}
    </Menu>
  );
};
