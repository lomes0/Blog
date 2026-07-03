"use client";

import { UserDocument } from "@/types";
import { Settings } from "lucide-react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormHelperText,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useFixedBodyScroll from "@/hooks/useFixedBodyScroll";
import useOnlineStatus from "@/hooks/useOnlineStatus";
import UploadDocument from "./Upload";
import UsersAutocomplete from "../User/UsersAutocomplete";
import { useEditDocumentForm } from "./hooks/useEditDocumentForm";
import DocumentVisibilityFields from "./DocumentVisibilityFields";
import {
  EditDateFields,
  EditDescriptionField,
  EditHandleField,
  EditStatusField,
  EditTitleField,
} from "./EditFields";

const EditDocumentDialog: React.FC<{
  userDocument: UserDocument;
  variant?: "menuitem" | "iconbutton";
  closeMenu?: () => void;
}> = ({ userDocument, variant = "iconbutton", closeMenu }) => {
  const isOnline = useOnlineStatus();

  const {
    cloudDocument,
    isAuthor,
    isCloud,
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
  } = useEditDocumentForm(userDocument);

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

            {!cloudDocument && (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  my: 1,
                  gap: 1,
                }}
              >
                <FormHelperText>
                  Save the document to cloud to unlock the following options
                </FormHelperText>
                <UploadDocument userDocument={userDocument} variant="button" />
              </Box>
            )}

            {isAuthor && (
              <UsersAutocomplete
                label="Coauthors"
                placeholder="Email"
                value={input.coauthors ?? []}
                onChange={updateCoauthors}
                sx={{ my: 2 }}
                disabled={!isOnline || !isCloud}
              />
            )}

            {isAuthor && (
              <DocumentVisibilityFields
                isPrivate={input.private}
                isPublished={input.published}
                isCollab={input.collab}
                disabled={!isOnline || !isCloud}
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
