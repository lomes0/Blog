import React, { useState } from "react";
import {
  Box,
  Button,
  Divider,
  Fade,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Tooltip,
  Typography,
} from "@mui/material";
import { Combine, FolderMinus, FolderOpen, Trash2, X } from "lucide-react";
import { Series } from "@/types";
import { ICON_SIZE } from "@/theme/icons";

interface BulkActionBarProps {
  count: number;
  onDelete: () => void;
  onClear: () => void;
  /** Merge the selected posts into one tabbed post. */
  onMerge: () => void;
  /** Whether merge is currently allowed (needs 2+ cloud posts). */
  canMerge: boolean;
  /** Series the selected posts can be moved into. */
  availableSeries: Series[];
  /** Move the selected posts to a series (id) or standalone (null). */
  onMove: (seriesId: string | null) => void;
  /** Whether move is allowed (cloud-only posts selected). */
  canMove: boolean;
}

export function BulkActionBar(
  {
    count,
    onDelete,
    onClear,
    onMerge,
    canMerge,
    availableSeries,
    onMove,
    canMove,
  }: BulkActionBarProps,
) {
  const [moveAnchor, setMoveAnchor] = useState<null | HTMLElement>(null);

  const handleMove = (seriesId: string | null) => {
    setMoveAnchor(null);
    onMove(seriesId);
  };

  return (
    <Fade in={count > 0} unmountOnExit>
      <Paper
        elevation={8}
        sx={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1200,
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          py: 1,
          borderRadius: 3,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          minWidth: 260,
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
        }}
      >
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            mr: 1,
            color: "text.primary",
            whiteSpace: "nowrap",
          }}
        >
          {count} selected
        </Typography>

        <Tooltip
          title={canMerge
            ? "Merge into one tabbed post"
            : "Select 2 or more cloud posts to merge"}
        >
          <span>
            <Button
              size="small"
              variant="text"
              disabled={!canMerge}
              startIcon={<Combine size={ICON_SIZE.inline} />}
              onClick={onMerge}
              sx={{ textTransform: "none", typography: "dense" }}
            >
              Merge
            </Button>
          </span>
        </Tooltip>

        <Tooltip
          title={canMove
            ? "Move to a series"
            : "Only cloud posts can be moved to a series"}
        >
          <span>
            <Button
              size="small"
              variant="text"
              disabled={!canMove}
              startIcon={<FolderOpen size={ICON_SIZE.inline} />}
              onClick={(e) => setMoveAnchor(e.currentTarget)}
              sx={{ textTransform: "none", typography: "dense" }}
            >
              Move
            </Button>
          </span>
        </Tooltip>

        <Menu
          anchorEl={moveAnchor}
          open={Boolean(moveAnchor)}
          onClose={() => setMoveAnchor(null)}
          transformOrigin={{ horizontal: "left", vertical: "bottom" }}
          anchorOrigin={{ horizontal: "left", vertical: "top" }}
          PaperProps={{ sx: { minWidth: 200, maxHeight: 320 } }}
        >
          <MenuItem dense onClick={() => handleMove(null)}>
            <ListItemIcon>
              <FolderMinus size={ICON_SIZE.dense} />
            </ListItemIcon>
            <ListItemText>No series (standalone)</ListItemText>
          </MenuItem>
          {availableSeries.length > 0 && <Divider sx={{ my: 0.5 }} />}
          {availableSeries.map((s) => (
            <MenuItem
              key={s.id}
              dense
              onClick={() => handleMove(s.id)}
            >
              <ListItemIcon>
                <FolderOpen size={ICON_SIZE.dense} />
              </ListItemIcon>
              <ListItemText>{s.title}</ListItemText>
            </MenuItem>
          ))}
        </Menu>

        <Tooltip title="Coming soon">
          <span>
            <Button
              size="small"
              variant="text"
              disabled
              sx={{ textTransform: "none", typography: "dense" }}
            >
              Tag
            </Button>
          </span>
        </Tooltip>

        <Button
          size="small"
          variant="text"
          color="error"
          startIcon={<Trash2 size={ICON_SIZE.inline} />}
          onClick={onDelete}
          sx={{ textTransform: "none", typography: "dense" }}
        >
          Delete
        </Button>

        <Box sx={{ flex: 1 }} />

        <Button
          size="small"
          variant="text"
          onClick={onClear}
          sx={{
            textTransform: "none",
            typography: "dense",
            color: "text.secondary",
            minWidth: "auto",
            p: 0.5,
          }}
        >
          <X size={ICON_SIZE.dense} />
        </Button>
      </Paper>
    </Fade>
  );
}
