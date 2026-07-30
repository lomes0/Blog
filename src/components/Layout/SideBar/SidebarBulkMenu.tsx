import React, { useState } from "react";
import {
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  ChevronRight,
  FolderInput,
  FolderMinus,
  Layers,
  Trash2,
} from "lucide-react";
import type { Series } from "@/types";
import { ICON_SIZE } from "@/theme/icons";
import type { BulkMenuState } from "./hooks/useSidebarBulkActions";

interface SidebarBulkMenuProps {
  menu: BulkMenuState | null;
  count: number;
  availableSeries: Series[];
  canMerge: boolean;
  onClose: () => void;
  onDelete: () => void;
  onMove: (seriesId: string | null) => void;
  onMerge: () => void;
}

const paperSx = { minWidth: 150 } as const;

/**
 * Context menu shown when right-clicking a multi-selection in the sidebar tree:
 * bulk delete, move-to-series (or out to root), and merge into tabs — the same
 * operations the posts page `BulkActionBar` offers.
 */
export const SidebarBulkMenu: React.FC<SidebarBulkMenuProps> = ({
  menu,
  count,
  availableSeries,
  canMerge,
  onClose,
  onDelete,
  onMove,
  onMerge,
}) => {
  const [seriesAnchor, setSeriesAnchor] = useState<null | HTMLElement>(null);
  const hasSeries = availableSeries.length > 0;

  const closeAll = () => {
    setSeriesAnchor(null);
    onClose();
  };

  return (
    <>
      <Menu
        open={menu !== null}
        onClose={closeAll}
        anchorReference="anchorPosition"
        anchorPosition={menu !== null
          ? { top: menu.mouseY, left: menu.mouseX }
          : undefined}
        slotProps={{ paper: { sx: paperSx } }}
      >
        <MenuItem
          onClick={(e) => setSeriesAnchor(e.currentTarget)}
          sx={{ justifyContent: "space-between" }}
        >
          <ListItemIcon>
            <FolderInput size={ICON_SIZE.dense} />
          </ListItemIcon>
          <ListItemText>Move {count} to series</ListItemText>
          <ChevronRight
            size={ICON_SIZE.inline}
            style={{ marginLeft: 8, flexShrink: 0 }}
          />
        </MenuItem>

        {canMerge && (
          <MenuItem onClick={() => onMerge()}>
            <ListItemIcon>
              <Layers size={ICON_SIZE.dense} />
            </ListItemIcon>
            <ListItemText>Merge into tabs</ListItemText>
          </MenuItem>
        )}

        <Divider sx={{ my: 0.5 }} />

        <MenuItem onClick={() => onDelete()} sx={{ color: "error.main" }}>
          <ListItemIcon sx={{ color: "inherit" }}>
            <Trash2 size={ICON_SIZE.dense} />
          </ListItemIcon>
          <ListItemText>
            Delete {count} item{count !== 1 ? "s" : ""}
          </ListItemText>
        </MenuItem>
      </Menu>

      <Menu
        anchorEl={seriesAnchor}
        open={Boolean(seriesAnchor)}
        onClose={() => setSeriesAnchor(null)}
        transformOrigin={{ horizontal: "left", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "top" }}
        slotProps={{ paper: { sx: paperSx } }}
      >
        <MenuItem
          onClick={() => {
            closeAll();
            onMove(null);
          }}
        >
          <ListItemIcon>
            <FolderMinus size={ICON_SIZE.dense} />
          </ListItemIcon>
          <ListItemText>Remove from series</ListItemText>
        </MenuItem>
        {hasSeries && <Divider sx={{ my: 0.5 }} />}
        {availableSeries.map((s) => (
          <MenuItem
            key={s.id}
            onClick={() => {
              closeAll();
              onMove(s.id);
            }}
          >
            <ListItemText primaryTypographyProps={{ noWrap: true }}>
              {s.title}
            </ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};
