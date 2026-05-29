"use client";
import { actions, useDispatch } from "@/store";
import { UserDocument } from "@/types";
import { RotateCcw } from "lucide-react";
import {
  Button,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
} from "@mui/material";
import { SxProps, Theme } from "@mui/material/styles";

const RestoreDocument: React.FC<
  {
    userDocument: UserDocument;
    variant?: "menuitem" | "button" | "iconbutton";
    closeMenu?: () => void;
    sx?: SxProps<Theme> | undefined;
  }
> = ({ userDocument, variant = "iconbutton", closeMenu, sx }) => {
  const dispatch = useDispatch();
  const localDocument = userDocument.local;
  const cloudDocument = userDocument.cloud;

  if (!localDocument || !cloudDocument) {
    return null;
  }

  const id = userDocument.id;
  const localDocumentRevisions = localDocument.revisions ?? [];
  const isLocalHeadLocalRevision = localDocumentRevisions.some((r) =>
    r.id === localDocument.head
  );
  const isCloudHeadLocalRevision = localDocumentRevisions.some((r) =>
    r.id === cloudDocument.head
  );

  const handleRestore = async () => {
    if (closeMenu) closeMenu();
    if (!isLocalHeadLocalRevision) {
      let localEditorDocument: ReturnType<
        typeof actions.getLocalDocument.fulfilled
      >["payload"];
      try {
        localEditorDocument = await dispatch(
          actions.getLocalDocument(id),
        ).unwrap() as ReturnType<
          typeof actions.getLocalDocument.fulfilled
        >["payload"];
      } catch {
        return dispatch(
          actions.announce({
            message: { title: "Document Not Found" },
          }),
        );
      }
      const editorDocumentRevision = {
        id: localEditorDocument.head,
        documentId: localEditorDocument.id,
        createdAt: localEditorDocument.updatedAt,
        data: localEditorDocument.data,
      };
      await dispatch(actions.createLocalRevision(editorDocumentRevision));
    }
    if (isCloudHeadLocalRevision) {
      try {
        const localRevision = await dispatch(
          actions.getLocalRevision(cloudDocument.head),
        ).unwrap() as ReturnType<
          typeof actions.getLocalRevision.fulfilled
        >["payload"];
        return dispatch(
          actions.updateLocalDocument({
            id,
            partial: {
              head: cloudDocument.head,
              updatedAt: cloudDocument.updatedAt,
              data: localRevision.data,
              parentId: localDocument.parentId, // Preserve parentId when restoring
            },
          }),
        );
      } catch {
        return dispatch(
          actions.announce({
            message: { title: "Local Revision Not Found" },
          }),
        );
      }
    }
    try {
      const cloudPayload = await dispatch(
        actions.getCloudDocument(id),
      ).unwrap() as ReturnType<
        typeof actions.getCloudDocument.fulfilled
      >["payload"];
      const { cloudDocument: _cloudDocument, ...editorDocument } = cloudPayload;
      await dispatch(
        actions.createLocalRevision({
          id: editorDocument.head,
          documentId: editorDocument.id,
          createdAt: editorDocument.updatedAt,
          data: editorDocument.data,
        }),
      );
      return dispatch(
        actions.updateLocalDocument({ id, partial: editorDocument }),
      );
    } catch {
      return dispatch(
        actions.announce({
          message: { title: "Cloud Document Not Found" },
        }),
      );
    }
  };

  if (variant === "menuitem") {
    return (
      <MenuItem onClick={handleRestore} sx={sx}>
        <ListItemIcon>
          <RotateCcw />
        </ListItemIcon>
        <ListItemText>
          Restore Cloud
        </ListItemText>
      </MenuItem>
    );
  }
  if (variant === "button") {
    return (
      <Button onClick={handleRestore} startIcon={<RotateCcw />} sx={sx}>
        Restore Cloud
      </Button>
    );
  }
  return (
    <IconButton
      aria-label="Restore Cloud"
      onClick={handleRestore}
      size="small"
      sx={sx}
    >
      {<RotateCcw />}
    </IconButton>
  );
};

export default RestoreDocument;
