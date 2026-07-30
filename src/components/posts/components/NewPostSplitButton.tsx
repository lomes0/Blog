import React, { useState } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import { ChevronDown, FolderPlus, Plus } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";

interface NewPostSplitButtonProps {
  /** In series mode the split shows "New post in series" + "Add/remove posts". */
  isSeries?: boolean;
  canEdit: boolean;
  onNewPost: () => void;
  onNewSeries: () => void;
  onAddRemovePosts?: () => void;
}

export function NewPostSplitButton({
  isSeries = false,
  canEdit,
  onNewPost,
  onNewSeries,
  onAddRemovePosts,
}: NewPostSplitButtonProps) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  if (!canEdit) return null;

  const handleOpenMenu = (e: React.MouseEvent<HTMLElement>) => {
    setAnchor(e.currentTarget);
  };
  const handleClose = () => setAnchor(null);

  const wrap = (fn: () => void) => () => {
    handleClose();
    fn();
  };

  return (
    <Box>
      <ButtonGroup
        size="small"
        variant="outlined"
        sx={{
          "& .MuiButton-root": {
            textTransform: "none",
            typography: "dense",
            color: "text.secondary",
            borderColor: "divider",
            "&:hover": { borderColor: "text.secondary" },
          },
        }}
      >
        <Button
          startIcon={<Plus size={ICON_SIZE.inline} />}
          onClick={onNewPost}
        >
          New
        </Button>
        <Button
          size="small"
          onClick={handleOpenMenu}
          aria-label="More creation options"
          sx={{ px: 0.75, minWidth: "auto" }}
        >
          <ChevronDown size={ICON_SIZE.inline} />
        </Button>
      </ButtonGroup>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={handleClose}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        PaperProps={{ sx: { minWidth: 200 } }}
      >
        {isSeries
          ? [
            <MenuItem key="new-in-series" onClick={wrap(onNewPost)} dense>
              <ListItemIcon>
                <Plus size={ICON_SIZE.dense} />
              </ListItemIcon>
              <ListItemText>New post in series</ListItemText>
            </MenuItem>,
            onAddRemovePosts && (
              <MenuItem key="add-remove" onClick={wrap(onAddRemovePosts)} dense>
                <ListItemIcon>
                  <FolderPlus size={ICON_SIZE.dense} />
                </ListItemIcon>
                <ListItemText>Add / remove posts</ListItemText>
              </MenuItem>
            ),
          ]
          : [
            <MenuItem key="new-post" onClick={wrap(onNewPost)} dense>
              <ListItemIcon>
                <Plus size={ICON_SIZE.dense} />
              </ListItemIcon>
              <ListItemText>New post</ListItemText>
            </MenuItem>,
            <MenuItem key="new-series" onClick={wrap(onNewSeries)} dense>
              <ListItemIcon>
                <FolderPlus size={ICON_SIZE.dense} />
              </ListItemIcon>
              <ListItemText>New series</ListItemText>
            </MenuItem>,
          ]}
      </Menu>
    </Box>
  );
}
