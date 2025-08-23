"use client";
import { actions, useDispatch } from "@/store";
import { DocumentType, UserDocument } from "@/types";
import { Delete, DeleteForever } from "@mui/icons-material";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
} from "@mui/material";
import { v4 as uuid } from "uuid";

/**
 * Component to delete both local and cloud versions of a document or directory at once
 */
const DeleteBothDocument: React.FC<{
  userDocument: UserDocument;
  variant?: "menuitem" | "iconbutton";
  closeMenu?: () => void;
}> = ({ userDocument, variant = "iconbutton", closeMenu }) => {
  const dispatch = useDispatch();
  const localDocument = userDocument.local;
  const cloudDocument = userDocument.cloud;
  const isLocal = !!localDocument;
  const isCloud = !!cloudDocument;
  const id = userDocument.id;
  const name = localDocument?.name || cloudDocument?.name || "This Item";

  // All documents are posts now (no directories)
  const document = userDocument.local || userDocument.cloud;
  const isDirectory = false; // No directories in blog structure
  const itemType = "Post";

  const handleDelete = async () => {
    if (closeMenu) closeMenu();
    const alert = {
      title: `Delete ${itemType}`,
      content:
        `Are you sure you want to delete post "${name}"? This will remove it from both cloud and local storage.`,
      actions: [
        { label: "Cancel", id: uuid() },
        { label: "Delete", id: uuid() },
      ],
    };
    const response = await dispatch(actions.alert(alert));
    if (response.payload === alert.actions[1].id) {
      // Delete from cloud first (if exists)
      if (isCloud) {
        await dispatch(actions.deleteCloudDocument(id));
      }

      // Then delete from local (if exists)
      if (isLocal) {
        await dispatch(actions.deleteLocalDocument(id));
      }
    }
  };

  if (variant === "menuitem") {
    return (
      <MenuItem onClick={handleDelete}>
        <ListItemIcon>
          <DeleteForever />
        </ListItemIcon>
        <ListItemText>Delete</ListItemText>
      </MenuItem>
    );
  }
  return (
    <IconButton
      aria-label={`Delete ${itemType}`}
      onClick={handleDelete}
      size="small"
    >
      <DeleteForever />
    </IconButton>
  );
};

export default DeleteBothDocument;
