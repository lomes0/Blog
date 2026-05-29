"use client";
import {
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import { ArrowUpDown, Copy, FilePen, FolderInput, Pin, Split, Trash2 } from "lucide-react";

interface TabContextMenuProps {
  anchorEl: HTMLElement | null;
  tabId: string | null;
  isRoot: boolean;
  onClose: () => void;
  onRename: (tabId: string) => void;
  onDuplicate: (tabId: string) => void;
  onMove: (tabId: string) => void;
  onSplitOff: (tabId: string) => void;
  onDelete: (tabId: string) => void;
}

const TabContextMenu: React.FC<TabContextMenuProps> = ({
  anchorEl,
  tabId,
  isRoot,
  onClose,
  onRename,
  onDuplicate,
  onMove,
  onSplitOff,
  onDelete,
}) => {
  const wrap = (fn: () => void) => () => {
    fn();
    onClose();
  };

  if (!tabId) return null;

  return (
    <Menu
      anchorEl={anchorEl}
      open={!!anchorEl}
      onClose={onClose}
      slotProps={{ paper: { sx: { minWidth: 210 } } }}
    >
      <MenuItem onClick={wrap(() => onRename(tabId))}>
        <ListItemIcon>
          <FilePen size={18} />
        </ListItemIcon>
        <ListItemText>Rename</ListItemText>
        <Typography variant="caption" color="text.disabled" sx={{ ml: 2 }}>
          F2
        </Typography>
      </MenuItem>

      <MenuItem onClick={wrap(() => onDuplicate(tabId))}>
        <ListItemIcon>
          <Copy size={18} />
        </ListItemIcon>
        <ListItemText>Duplicate tab</ListItemText>
        <Typography variant="caption" color="text.disabled" sx={{ ml: 2 }}>
          ⌘D
        </Typography>
      </MenuItem>

      {!isRoot && (
        <MenuItem onClick={wrap(() => onMove(tabId))}>
          <ListItemIcon>
            <FolderInput size={18} />
          </ListItemIcon>
          <ListItemText>Move to other post…</ListItemText>
        </MenuItem>
      )}

      {!isRoot && (
        <MenuItem onClick={wrap(() => onSplitOff(tabId))}>
          <ListItemIcon>
            <Split size={18} />
          </ListItemIcon>
          <ListItemText>Split off as new post</ListItemText>
        </MenuItem>
      )}

      <Divider />

      <MenuItem disabled>
        <ListItemIcon>
          <Pin size={18} />
        </ListItemIcon>
        <ListItemText>Pin tab</ListItemText>
      </MenuItem>

      <MenuItem disabled>
        <ListItemIcon>
          <ArrowUpDown size={18} />
        </ListItemIcon>
        <ListItemText>Reorder…</ListItemText>
      </MenuItem>

      <Divider />

      <MenuItem
        disabled={isRoot}
        onClick={wrap(() => onDelete(tabId))}
        sx={{ color: isRoot ? undefined : "error.main" }}
      >
        <ListItemIcon>
          <Trash2 size={18} style={{ color: isRoot ? "var(--mui-palette-action-disabled)" : "var(--mui-palette-error-main)" }} />
        </ListItemIcon>
        <ListItemText>Delete tab</ListItemText>
        <Typography variant="caption" color="text.disabled" sx={{ ml: 2 }}>
          ⌘⌫
        </Typography>
      </MenuItem>
    </Menu>
  );
};

export default TabContextMenu;
