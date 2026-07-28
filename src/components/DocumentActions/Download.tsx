"use client";
import { actions, useDispatch } from "@/store";
import { Post, Revision } from "@/types";
import { Download } from "lucide-react";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
} from "@mui/material";

const DownloadDocument: React.FC<
  {
    post: Post;
    variant?: "menuitem" | "iconbutton";
    closeMenu?: () => void;
  }
> = ({ post, variant = "iconbutton", closeMenu }) => {
  const dispatch = useDispatch();
  const id = post.id;

  /**
   * The post plus the full content of every revision, which is what a backup
   * needs — `getPost` returns revision metadata only.
   */
  const getBackupDocument = async () => {
    let full: Post;
    try {
      full = await dispatch(actions.getPost(id)).unwrap();
    } catch {
      return null;
    }
    const revisions: Revision[] = [];
    for (const meta of full.revisions ?? []) {
      if (meta.id === full.head) continue; // already carried as `data`
      try {
        revisions.push(await dispatch(actions.getRevision(meta.id)).unwrap());
      } catch {
        // a missing revision shouldn't sink the whole backup
      }
    }
    return { ...full, revisions };
  };

  const handleSave = async () => {
    if (closeMenu) closeMenu();
    const backupDocument = await getBackupDocument();
    if (!backupDocument) {
      return dispatch(
        actions.announce({ message: { title: "Document Not Found" } }),
      );
    }
    const blob = new Blob([JSON.stringify(backupDocument)], {
      type: "text/json",
    });
    const link = window.document.createElement("a");

    link.download = backupDocument.name + ".me";
    link.href = window.URL.createObjectURL(blob);
    link.dataset.downloadurl = ["text/json", link.download, link.href].join(
      ":",
    );

    link.click();
    link.remove();
  };

  if (variant === "menuitem") {
    return (
      <MenuItem onClick={handleSave}>
        <ListItemIcon>
          <Download />
        </ListItemIcon>
        <ListItemText>Download</ListItemText>
      </MenuItem>
    );
  }
  return (
    <IconButton
      aria-label="Download Document"
      onClick={handleSave}
      size="small"
    >
      <Download />
    </IconButton>
  );
};

export default DownloadDocument;
