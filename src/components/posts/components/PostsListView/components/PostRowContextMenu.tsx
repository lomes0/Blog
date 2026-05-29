import React, { useState } from "react";
import {
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from "@mui/material";
import { MoreHorizontal, Pencil, Tag, Trash2 } from "lucide-react";

interface PostRowContextMenuProps {
  /** Pass "series" to show series-specific items (no move-to-series). */
  mode?: "post" | "series";
  onRename: () => void;
  onDelete: () => void;
  /** Only used in post mode. */
  onMoveToSeries?: () => void;
}

export function PostRowContextMenu({
  mode = "post",
  onRename,
  onDelete,
  onMoveToSeries,
}: PostRowContextMenuProps) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const open = Boolean(anchor);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setAnchor(e.currentTarget);
  };
  const handleClose = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setAnchor(null);
  };

  const wrap = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    handleClose();
    fn();
  };

  return (
    <>
      <IconButton
        size="small"
        onClick={handleOpen}
        aria-label="Row actions"
        className="row-actions-btn"
        sx={{
          width: 24,
          height: 24,
          color: "text.secondary",
          opacity: 0,
          transition: "opacity 0.15s",
          ...(open && { opacity: 1 }),
        }}
      >
        <MoreHorizontal size={16} />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => handleClose()}
        onClick={(e) => e.stopPropagation()}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        PaperProps={{ sx: { minWidth: 180 } }}
      >
        <MenuItem onClick={wrap(onRename)} dense>
          <ListItemIcon>
            <Pencil size={15} />
          </ListItemIcon>
          <ListItemText>Rename</ListItemText>
        </MenuItem>

        {mode === "post" && onMoveToSeries && (
          <Tooltip title="Coming soon" placement="left">
            <span>
              <MenuItem dense disabled>
                <ListItemIcon>
                  <Tag size={15} />
                </ListItemIcon>
                <ListItemText>Move to series</ListItemText>
              </MenuItem>
            </span>
          </Tooltip>
        )}

        <Tooltip title="Coming soon" placement="left">
          <span>
            <MenuItem dense disabled>
              <ListItemIcon>
                <Tag size={15} />
              </ListItemIcon>
              <ListItemText>Edit tags</ListItemText>
            </MenuItem>
          </span>
        </Tooltip>

        <Divider sx={{ my: 0.5 }} />

        <MenuItem onClick={wrap(onDelete)} dense sx={{ color: "error.main" }}>
          <ListItemIcon sx={{ color: "inherit" }}>
            <Trash2 size={15} />
          </ListItemIcon>
          <ListItemText>
            {mode === "series" ? "Delete series" : "Delete"}
          </ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
