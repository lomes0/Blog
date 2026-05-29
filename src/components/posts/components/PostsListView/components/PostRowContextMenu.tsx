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
import { ChevronRight, FolderOpen, MoreHorizontal, Pencil, Tag, Trash2 } from "lucide-react";
import { Series } from "@/types";

interface PostRowContextMenuProps {
  /** Pass "series" to show series-specific items (no move-to-series). */
  mode?: "post" | "series";
  onRename: () => void;
  onDelete: () => void;
  /** Series the post can be moved to. Hidden when empty. */
  availableSeries?: Series[];
  onMoveToSeries?: (seriesId: string) => void;
}

export function PostRowContextMenu({
  mode = "post",
  onRename,
  onDelete,
  availableSeries,
  onMoveToSeries,
}: PostRowContextMenuProps) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [seriesMenuAnchor, setSeriesMenuAnchor] = useState<null | HTMLElement>(null);
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

        {mode === "post" && onMoveToSeries && availableSeries && availableSeries.length > 0 && (
          <>
            <MenuItem
              dense
              onClick={(e) => {
                e.stopPropagation();
                setSeriesMenuAnchor(e.currentTarget);
              }}
              sx={{ justifyContent: "space-between" }}
            >
              <ListItemIcon>
                <FolderOpen size={15} />
              </ListItemIcon>
              <ListItemText>Move to series</ListItemText>
              <ChevronRight size={14} style={{ marginLeft: 8, flexShrink: 0 }} />
            </MenuItem>
            <Menu
              anchorEl={seriesMenuAnchor}
              open={Boolean(seriesMenuAnchor)}
              onClose={() => setSeriesMenuAnchor(null)}
              onClick={(e) => e.stopPropagation()}
              transformOrigin={{ horizontal: "left", vertical: "top" }}
              anchorOrigin={{ horizontal: "right", vertical: "top" }}
              PaperProps={{ sx: { minWidth: 180 } }}
            >
              {availableSeries.map((s) => (
                <MenuItem
                  key={s.id}
                  dense
                  onClick={() => {
                    setSeriesMenuAnchor(null);
                    handleClose();
                    onMoveToSeries(s.id);
                  }}
                >
                  <ListItemText>{s.title}</ListItemText>
                </MenuItem>
              ))}
            </Menu>
          </>
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
