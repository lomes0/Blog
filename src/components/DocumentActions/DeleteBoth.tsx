"use client";
import { actions, useDispatch } from "@/store";
import { UserDocument } from "@/types";
import { Trash2 } from "lucide-react";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
} from "@mui/material";
import { useRouter } from "next/navigation";

/**
 * Component to delete both local and cloud versions of a document or directory at once
 */
const DeleteBothDocument: React.FC<{
  userDocument: UserDocument;
  variant?: "menuitem" | "iconbutton";
  closeMenu?: () => void;
}> = ({ userDocument, variant = "iconbutton", closeMenu }) => {
  const dispatch = useDispatch();
  const router = useRouter();
  const localDocument = userDocument.local;
  const cloudDocument = userDocument.cloud;
  const isCloud = !!cloudDocument;
  const id = userDocument.id;
  const name = localDocument?.name || cloudDocument?.name || "This Item";

  const handleDelete = async () => {
    if (closeMenu) closeMenu();
    const alert = {
      title: "Delete Post",
      content:
        `Are you sure you want to delete post "${name}"? This will remove it from both cloud and local storage.`,
      actions: [
        { label: "Cancel", id: "cancel" },
        { label: "Delete", id: "confirm-delete" },
      ],
    };
    const response = await dispatch(actions.alert(alert));
    if (response.payload === alert.actions[1].id) {
      // Delete from cloud first (if exists)
      if (isCloud) {
        await dispatch(actions.deleteCloudDocument(id));
      }

      // Then always delete the local (IndexedDB) copy. `userDocument.local`
      // reflects only what the caller knew — a server-rendered item may still
      // have a local copy — and the delete is idempotent when there is nothing
      // to remove.
      await dispatch(actions.deleteLocalDocument(id));

      // Refresh the page to reflect the deletion
      router.refresh();
    }
  };

  if (variant === "menuitem") {
    return (
      <MenuItem onClick={handleDelete}>
        <ListItemIcon>
          <Trash2 />
        </ListItemIcon>
        <ListItemText>Delete</ListItemText>
      </MenuItem>
    );
  }
  return (
    <IconButton
      aria-label="Delete Post"
      onClick={handleDelete}
      size="small"
    >
      <Trash2 />
    </IconButton>
  );
};

export default DeleteBothDocument;
