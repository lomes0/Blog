"use client";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMenuState } from "@/hooks/useMenuState";

interface SeriesActionsProps {
  seriesId: string;
  onDelete?: () => void;
}

export default function SeriesActions(
  { seriesId, onDelete }: SeriesActionsProps,
) {
  const {
    anchorEl,
    menuOpen: open,
    openMenu: handleClick,
    closeMenu: handleClose,
  } = useMenuState();

  const handleDelete = () => {
    handleClose();
    if (onDelete) {
      onDelete();
    }
  };

  return (
    <>
      <IconButton
        aria-label="more actions"
        aria-controls={open ? "series-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
        onClick={handleClick}
      >
        <MoreVertical />
      </IconButton>
      <Menu
        id="series-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          "aria-labelledby": "series-button",
        }}
      >
        <MenuItem
          component={Link}
          href={`/series/${seriesId}/edit`}
          onClick={handleClose}
        >
          <ListItemIcon>
            <Pencil size={18} />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDelete}>
          <ListItemIcon>
            <Trash2 size={18} />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
