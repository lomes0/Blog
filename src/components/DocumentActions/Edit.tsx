"use client";
import { actions, useDispatch, useSelector } from "@/store";
import {
  CheckHandleResponse,
  DocumentType,
  DocumentUpdateInput,
  User,
  UserDocument,
} from "@/types";
import { CloudOff, Settings } from "@mui/icons-material";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  FormHelperText,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@mui/material/styles";
import useFixedBodyScroll from "@/hooks/useFixedBodyScroll";
import { validate } from "uuid";
import { debounce } from "@mui/material/utils";
import UploadDocument from "./Upload";
import UsersAutocomplete from "../User/UsersAutocomplete";
import useOnlineStatus from "@/hooks/useOnlineStatus";
import BackgroundImageUploader from "../BackgroundImageUploader";

const EditDocument: React.FC<
  {
    userDocument: UserDocument;
    variant?: "menuitem" | "iconbutton";
    closeMenu?: () => void;
  }
> = ({ userDocument, variant = "iconbutton", closeMenu }) => {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);
  const isOnline = useOnlineStatus();
  const localDocument = userDocument?.local;
  const cloudDocument = userDocument?.cloud;
  const isLocal = !!localDocument;
  const isCloud = !!cloudDocument;
  const isUploaded = isLocal && isCloud;
  const isPublished = isCloud && cloudDocument.published;
  const isCollab = isCloud && cloudDocument.collab;
  const isPrivate = isCloud && cloudDocument.private;
  const isAuthor = isCloud ? cloudDocument.author.id === user?.id : true;
  const id = userDocument.id;
  const name = cloudDocument?.name ?? localDocument?.name ??
    "Untitled Document";
  const handle = cloudDocument?.handle ?? localDocument?.handle ?? null;
  const isCloudOnly = !isLocal && isCloud;
  const document = isCloudOnly ? cloudDocument : localDocument;
  // Make sure we properly check if it's a directory
  const isDirectory = document?.type === DocumentType.DIRECTORY;
  const currentDomainId = document?.domainId || null;

  const [input, setInput] = useState<Partial<DocumentUpdateInput>>({
    name,
    handle,
    coauthors: cloudDocument?.coauthors.map((u) => u.email) ?? [],
    private: isPrivate,
    published: isPublished,
    collab: isCollab,
    background_image: document?.background_image || null,
    sort_order: document?.sort_order || null,
    domainId: currentDomainId,
  });

  const [validating, setValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const hasErrors = Object.keys(validationErrors).length > 0;
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  useEffect(() => {
    setInput({
      name,
      handle,
      coauthors: cloudDocument?.coauthors.map((u) => u.email) ?? [],
      private: isPrivate,
      published: isPublished,
      collab: isCollab,
      background_image: document?.background_image || null,
      sort_order: document?.sort_order || null,
      domainId: currentDomainId,
    });
    setValidating(false);
    setValidationErrors({});
  }, [userDocument, editDialogOpen]);

  const openEditDialog = () => {
    if (closeMenu) closeMenu();
    setEditDialogOpen(true);
  };

  const closeEditDialog = () => {
    setEditDialogOpen(false);
  };

  const updateInput = (partial: Partial<DocumentUpdateInput>) => {
    setInput((input) => ({ ...input, ...partial }));
  };

  const updateCoauthors = (users: (User | string)[]) => {
    const coauthors = users.map((u) => typeof u === "string" ? u : u.email);
    updateInput({ coauthors });
  };

  const updateBackgroundImage = (imagePath: string | null) => {
    updateInput({ background_image: imagePath });
  };

  const updateHandle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.trim().toLowerCase().replace(
      /[^A-Za-z0-9]/g,
      "-",
    );
    updateInput({ handle: value });
    if (!value || value === handle) return setValidationErrors({});
    if (value.length < 3) {
      return setValidationErrors({
        handle:
          "Handle is too short: Handle must be at least 3 characters long",
      });
    }
    if (!/^[a-zA-Z0-9-]+$/.test(value)) {
      return setValidationErrors({
        handle:
          "Invalid Handle: Handle must only contain letters, numbers, and hyphens",
      });
    }
    if (validate(value)) {
      return setValidationErrors({
        handle: "Invalid Handle: Handle must not be a UUID",
      });
    }
    setValidating(true);
    checkHandle(value);
  };

  const checkHandle = useCallback(
    debounce(async (handle: string) => {
      try {
        const response = await fetch(
          `/api/documents/check?handle=${handle}`,
        );
        const { error } = await response.json() as CheckHandleResponse;
        if (error) {
          setValidationErrors({
            handle: `${error.title}: ${error.subtitle}`,
          });
        } else setValidationErrors({});
      } catch (error) {
        setValidationErrors({
          handle: `Something went wrong: Please try again later`,
        });
      }
      setValidating(false);
    }, 500),
    [],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    closeEditDialog();
    const partial: Partial<DocumentUpdateInput> = {};
    if (input.name !== name) {
      partial.name = input.name;
      partial.updatedAt = new Date().toISOString();
    }
    if (input.handle !== handle) {
      partial.handle = input.handle || null;
    }
    if (
      input.coauthors?.join(",") !==
        cloudDocument?.coauthors.map((u) => u.email).join(",")
    ) {
      partial.coauthors = input.coauthors;
    }
    if (input.private !== isPrivate) {
      partial.private = input.private;
    }
    if (input.published !== isPublished) {
      partial.published = input.published;
    }
    if (input.collab !== isCollab) {
      partial.collab = input.collab;
    }
    // Add background_image to the update if it has changed
    if (input.background_image !== document?.background_image) {
      partial.background_image = input.background_image;
    }
    // Add sort_order to the update if it has changed
    if (input.sort_order !== document?.sort_order) {
      partial.sort_order = input.sort_order;
    }
    // Add domainId to the update if it has changed
    if (input.domainId !== document?.domainId) {
      partial.domainId = input.domainId;
      console.log(
        `Setting domainId to ${input.domainId} for document ${id} (current: ${document?.domainId})`,
      );
    }
    // Preserve parentId when updating document
    if (document?.parentId) {
      partial.parentId = document.parentId;
      console.log(
        `Preserving parentId ${document.parentId} when updating document ${id}`,
      );
    }

    console.log("Edit dialog form submission - partial update:", partial);

    if (Object.keys(partial).length === 0) return;
    if (isLocal) {
      try {
        dispatch(actions.updateLocalDocument({ id, partial }));
      } catch (err) {
        dispatch(actions.announce({
          message: {
            title: "Error Updating Document",
            subtitle: "An error occurred while updating local document",
          },
        }));
      }
    }
    if (isUploaded || isCloud) {
      await dispatch(actions.updateCloudDocument({ id, partial }));
    }
  };

  useFixedBodyScroll(editDialogOpen);
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));

  return (
    <>
      {variant === "menuitem"
        ? (
          <MenuItem onClick={openEditDialog}>
            <ListItemIcon>
              <Settings />
            </ListItemIcon>
            <ListItemText>Edit</ListItemText>
          </MenuItem>
        )
        : (
          <IconButton
            aria-label="Edit Document"
            onClick={openEditDialog}
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
          <DialogTitle>
            Edit {isDirectory ? "Directory" : "Document"}
          </DialogTitle>
          <DialogContent
            sx={{
              "& .MuiFormHelperText-root": {
                overflow: "hidden",
                textOverflow: "ellipsis",
              },
            }}
          >
            <TextField
              margin="normal"
              size="small"
              fullWidth
              autoFocus
              label={isDirectory ? "Directory Name" : "Document Name"}
              value={input.name || ""}
              onChange={(e) => updateInput({ name: e.target.value })}
              sx={{ "& .MuiInputBase-root": { height: 40 } }}
            />
            <TextField
              margin="normal"
              size="small"
              fullWidth
              label={isDirectory ? "Directory Handle" : "Document Handle"}
              disabled={!isOnline}
              value={input.handle || ""}
              onChange={updateHandle}
              error={!validating && !!validationErrors.handle}
              helperText={validating
                ? "Validating..."
                : validationErrors.handle
                ? validationErrors.handle
                : input.handle
                ? `https://matheditor.me/view/${input.handle}`
                : "This will be used in the URL of your document"}
            />

            {/* Background image uploader for directories */}
            {isDirectory && isAuthor && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography
                  variant="subtitle2"
                  color="text.secondary"
                  gutterBottom
                >
                  Directory Options
                </Typography>
                <BackgroundImageUploader
                  userDocument={userDocument}
                  onChange={updateBackgroundImage}
                  currentImage={document?.background_image ||
                    null}
                />
              </>
            )}

            {/* Sort order field for both documents and directories */}
            {isAuthor && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography
                  variant="subtitle2"
                  color="text.secondary"
                  gutterBottom
                >
                  Sort Options
                </Typography>
                <TextField
                  margin="normal"
                  size="small"
                  fullWidth
                  label="Sort Order"
                  type="number"
                  inputProps={{ min: 0, step: 1 }}
                  value={input.sort_order === null ? "" : input.sort_order}
                  onChange={(e) => {
                    const value = e.target.value === ""
                      ? null
                      : Number(e.target.value);
                    updateInput({ sort_order: value });
                  }}
                  helperText="Items with sort order > 0 will appear first, sorted by this value. Leave empty for default sorting."
                />
              </>
            )}

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
                <UploadDocument
                  userDocument={userDocument}
                  variant="button"
                />
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
              <FormControlLabel
                label="Private"
                control={
                  <Checkbox
                    checked={input.private}
                    disabled={!isOnline || !isCloud}
                    onChange={() =>
                      updateInput({
                        private: !input.private,
                        published: input.published &&
                          input.private,
                        collab: input.collab &&
                          input.private,
                      })}
                  />
                }
              />
            )}
            <FormHelperText>
              Private documents are only accessible to authors and coauthors.
            </FormHelperText>
            {isAuthor && (
              <FormControlLabel
                label="Published"
                control={
                  <Checkbox
                    checked={input.published}
                    disabled={!isOnline || !isCloud ||
                      input.private}
                    onChange={() =>
                      updateInput({
                        published: !input.published,
                      })}
                  />
                }
              />
            )}
            <FormHelperText>
              Published documents are showcased on the homepage, can be forked
              by anyone, and can be found by search engines.
            </FormHelperText>
            {isAuthor && (
              <FormControlLabel
                label="Collab"
                control={
                  <Checkbox
                    checked={input.collab}
                    disabled={!isOnline || !isCloud ||
                      input.private}
                    onChange={() =>
                      updateInput({
                        collab: !input.collab,
                      })}
                  />
                }
              />
            )}
            <FormHelperText>
              Collab documents are open for anyone to edit.
            </FormHelperText>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeEditDialog}>Cancel</Button>
            <Button
              type="submit"
              disabled={validating || hasErrors}
            >
              Save
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </>
  );
};

export default EditDocument;
