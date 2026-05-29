"use client";
import { actions, useDispatch, useSelector } from "@/store";
import { EditorDocument, UserDocument } from "@/types";
import { CloudUpload, RefreshCcw } from "lucide-react";
import {
  Button,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
} from "@mui/material";
import { SxProps, Theme } from "@mui/material/styles";

const UploadDocument: React.FC<
  {
    userDocument: UserDocument;
    variant?: "menuitem" | "button" | "iconbutton";
    closeMenu?: () => void;
    sx?: SxProps<Theme> | undefined;
  }
> = ({ userDocument, variant = "iconbutton", closeMenu, sx }) => {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);
  const localDocument = userDocument?.local;
  const cloudDocument = userDocument?.cloud;
  const isLocal = !!localDocument;
  const isCloud = !!cloudDocument;
  const isUploaded = isLocal && isCloud;
  const isUpToDate = isUploaded && localDocument.head === cloudDocument.head;
  const id = userDocument.id;
  const localDocumentRevisions = localDocument?.revisions ?? [];
  const cloudDocumentRevisions = cloudDocument?.revisions ?? [];
  const isHeadLocalRevision = localDocumentRevisions.some((r) =>
    r.id === localDocument?.head
  );
  const isHeadCloudRevision = cloudDocumentRevisions.some((r) =>
    r.id === localDocument?.head
  );
  const isHeadOutOfSync = isUploaded &&
    localDocument.head !== cloudDocument.head;

  const handleCreate = async () => {
    if (closeMenu) closeMenu();
    if (!user) {
      return dispatch(actions.announce({
        message: {
          title: "You are not signed in",
          subtitle: "Please sign in to save your revision to the cloud",
        },
        action: { label: "Login", onClick: "login()" },
      }));
    }
    let editorDocument: EditorDocument;
    try {
      editorDocument = await dispatch(actions.getLocalDocument(id))
        .unwrap() as EditorDocument;
    } catch {
      return dispatch(
        actions.announce({ message: { title: "Document Not Found" } }),
      );
    }
    if (!isHeadLocalRevision) {
      const editorDocumentRevision = {
        id: editorDocument.head,
        documentId: editorDocument.id,
        createdAt: editorDocument.updatedAt,
        data: editorDocument.data,
      };
      await dispatch(actions.createLocalRevision(editorDocumentRevision));
    }
    return dispatch(actions.createCloudDocument(editorDocument));
  };

  const handleUpdate = async () => {
    if (closeMenu) closeMenu();
    if (!user) {
      return dispatch(actions.announce({
        message: {
          title: "You are not signed in",
          subtitle: "Please sign in to save your revision to the cloud",
        },
        action: { label: "Login", onClick: "login()" },
      }));
    }
    if (isUpToDate) {
      return dispatch(
        actions.announce({
          message: { title: "Document is already Up to Date" },
        }),
      );
    }
    if (isHeadCloudRevision && isHeadOutOfSync) {
      return dispatch(
        actions.updateCloudDocument({
          id,
          partial: {
            head: localDocument.head,
            updatedAt: localDocument.updatedAt,
            parentId: localDocument.parentId, // Preserve parentId when updating
          },
        }),
      );
    }
    let editorDocument: ReturnType<
      typeof actions.getLocalDocument.fulfilled
    >["payload"];
    try {
      editorDocument = await dispatch(actions.getLocalDocument(id))
        .unwrap() as ReturnType<
          typeof actions.getLocalDocument.fulfilled
        >["payload"];
    } catch {
      return dispatch(
        actions.announce({ message: { title: "Document Not Found" } }),
      );
    }
    if (!isHeadLocalRevision) {
      const editorDocumentRevision = {
        id: editorDocument.head,
        documentId: editorDocument.id,
        createdAt: editorDocument.updatedAt,
        data: editorDocument.data,
      };
      await dispatch(actions.createLocalRevision(editorDocumentRevision));
    }
    return dispatch(
      actions.updateCloudDocument({ id, partial: editorDocument }),
    );
  };

  if (variant === "menuitem") {
    return (
      <MenuItem
        onClick={isUploaded ? handleUpdate : handleCreate}
        sx={sx}
      >
        <ListItemIcon>
          {isUploaded ? <RefreshCcw /> : <CloudUpload />}
        </ListItemIcon>
        <ListItemText>
          {isUploaded ? "Update Cloud" : "Save to Cloud"}
        </ListItemText>
      </MenuItem>
    );
  }
  if (variant === "button") {
    return (
      <Button
        onClick={isUploaded ? handleUpdate : handleCreate}
        startIcon={isUploaded ? <RefreshCcw /> : <CloudUpload />}
        sx={sx}
      >
        {isUploaded ? "Update Cloud" : "Save to Cloud"}
      </Button>
    );
  }
  return (
    <IconButton
      aria-label="Upload Document"
      onClick={isUploaded ? handleUpdate : handleCreate}
      size="small"
      sx={sx}
    >
      {isUploaded ? <RefreshCcw /> : <CloudUpload />}
    </IconButton>
  );
};

export default UploadDocument;
