"use client";

import { Post } from "@/types";
import { Settings } from "lucide-react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useFixedBodyScroll from "@/hooks/useFixedBodyScroll";
import useOnlineStatus from "@/hooks/useOnlineStatus";
import UsersAutocomplete from "../User/UsersAutocomplete";
import { useEditDocumentForm } from "./hooks/useEditDocumentForm";
import { capabilities } from "@/lib/capabilities";
import { useSelector } from "@/store";
import DocumentVisibilityFields from "./DocumentVisibilityFields";
import {
  EditDateFields,
  EditDescriptionField,
  EditHandleField,
  EditStatusField,
  EditTitleField,
} from "./EditFields";

const EditDocumentDialog: React.FC<{
  post: Post;
  variant?: "menuitem" | "iconbutton";
  closeMenu?: () => void;
}> = ({ post, variant = "iconbutton", closeMenu }) => {
  const isOnline = useOnlineStatus();

  const {
    isAuthor,
    input,
    validating,
    validationErrors,
    hasErrors,
    editDialogOpen,
    updateInput,
    updateCoauthors,
    updateHandle,
    openEditDialog,
    closeEditDialog,
    handleSubmit,
  } = useEditDocumentForm(post);
  const can = capabilities(useSelector((state) => state.user));

  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  useFixedBodyScroll(editDialogOpen);

  return (
    <>
      {variant === "menuitem"
        ? (
          <MenuItem onClick={() => openEditDialog(closeMenu)}>
            <ListItemIcon>
              <Settings />
            </ListItemIcon>
            <ListItemText>Edit</ListItemText>
          </MenuItem>
        )
        : (
          <IconButton
            aria-label="Edit Document"
            onClick={() => openEditDialog(closeMenu)}
            size="small"
          >
            <Settings />
          </IconButton>
        )}
      <Dialog
        open={editDialogOpen}
        onClose={closeEditDialog}
        fullWidth
        maxWidth="xs"
        fullScreen={fullScreen}
      >
        <Box
          component="form"
          onSubmit={handleSubmit}
          noValidate
          autoComplete="off"
          spellCheck="false"
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            height: "100%",
          }}
        >
          <DialogTitle>Edit Post</DialogTitle>
          <DialogContent
            sx={{
              "& .MuiFormHelperText-root": {
                overflow: "hidden",
                textOverflow: "ellipsis",
              },
            }}
          >
            <EditTitleField
              value={input.name || ""}
              onChange={(name) => updateInput({ name })}
            />
            <EditDescriptionField
              value={input.description || ""}
              onChange={(description) => updateInput({ description })}
            />
            <EditHandleField
              value={input.handle || ""}
              onChange={updateHandle}
              validating={validating}
              error={validationErrors.handle}
              disabled={!isOnline}
            />
            <EditDateFields
              value={input.createdAt}
              onChange={(createdAt) => updateInput({ createdAt })}
              disabled={!isAuthor}
            />
            <EditStatusField
              value={input.status}
              onChange={(status) => updateInput({ status })}
              disabled={!isAuthor}
            />

            {isAuthor && can.coauthors && (
              <UsersAutocomplete
                label="Coauthors"
                placeholder="Email"
                value={input.coauthors ?? []}
                onChange={updateCoauthors}
                sx={{ my: 2 }}
                disabled={!isOnline}
              />
            )}

            {isAuthor && can.publish && (
              <DocumentVisibilityFields
                isPrivate={input.private}
                isPublished={input.published}
                isCollab={input.collab}
                disabled={!isOnline}
                onChange={updateInput}
              />
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeEditDialog}>Cancel</Button>
            <Button type="submit" disabled={validating || hasErrors}>
              Save
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </>
  );
};

export default EditDocumentDialog;
