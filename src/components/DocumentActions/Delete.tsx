"use client";
import { actions, useDispatch } from "@/store";
import { Post } from "@/types";
import { Trash2 } from "lucide-react";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
} from "@mui/material";
import { useRouter } from "next/navigation";

/** Delete a post. */
const DeletePost: React.FC<{
  post: Post;
  variant?: "menuitem" | "iconbutton";
  closeMenu?: () => void;
}> = ({ post, variant = "iconbutton", closeMenu }) => {
  const dispatch = useDispatch();
  const router = useRouter();
  const id = post.id;
  const name = post.title || "This Item";

  const handleDelete = async () => {
    if (closeMenu) closeMenu();
    const alert = {
      title: "Delete Post",
      content:
        `Are you sure you want to delete post "${name}"? This cannot be undone.`,
      actions: [
        { label: "Cancel", id: "cancel" },
        { label: "Delete", id: "confirm-delete" },
      ],
    };
    const response = await dispatch(actions.alert(alert));
    if (response.payload === alert.actions[1].id) {
      await dispatch(actions.deletePost(id));
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

export default DeletePost;
