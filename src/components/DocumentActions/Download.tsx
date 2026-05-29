"use client";
import { actions, useDispatch } from "@/store";
import { BackupDocument, UserDocument } from "@/types";
import { Download } from "lucide-react";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
} from "@mui/material";

const DownloadDocument: React.FC<
  {
    userDocument: UserDocument;
    variant?: "menuitem" | "iconbutton";
    closeMenu?: () => void;
  }
> = ({ userDocument, variant = "iconbutton", closeMenu }) => {
  const dispatch = useDispatch();
  const localDocument = userDocument?.local;
  const isLocal = !!localDocument;
  const id = userDocument.id;

  const getEditorDocument = async () => {
    try {
      if (isLocal) {
        return await dispatch(actions.getLocalDocument(id))
          .unwrap() as ReturnType<
            typeof actions.getLocalDocument.fulfilled
          >["payload"];
      } else {
        const { cloudDocument: _cloud, ...editorDocument } = await dispatch(
          actions.getCloudDocument(id),
        ).unwrap() as ReturnType<
          typeof actions.getCloudDocument.fulfilled
        >["payload"];
        return editorDocument;
      }
    } catch {
      return undefined;
    }
  };

  const getBackupDocument = async () => {
    const editorDocument = await getEditorDocument();
    if (!editorDocument) return null;
    const backupDocument: BackupDocument = {
      ...editorDocument,
      revisions: [],
    };
    try {
      const revisions = await dispatch(
        actions.getLocalDocumentRevisions(id),
      ).unwrap() as ReturnType<
        typeof actions.getLocalDocumentRevisions.fulfilled
      >["payload"];
      backupDocument.revisions = revisions.filter((revision) =>
        revision.id !== editorDocument.head
      );
    } catch {
      // no revisions available
    }
    return backupDocument;
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
