"use client";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import { Delete, Edit, MoreVert } from "@mui/icons-material";
import { useState } from "react";
import Link from "next/link";

interface SeriesActionsProps {
  seriesId: string;
  onDelete?: () => void;
}

export default function SeriesActions(
  { seriesId, onDelete }: SeriesActionsProps,
) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

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
        <MoreVert />
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
            <Edit fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit Series</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDelete}>
          <ListItemIcon>
            <Delete fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete Series</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
