"use client";
import React, { useEffect, useState } from "react";
import {
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Link,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Typography,
} from "@mui/material";
import {
  ArrowBack,
  ArrowForward,
  Folder,
  Home as HomeIcon,
} from "@mui/icons-material";
import { actions, useDispatch, useSelector } from "@/store";
import { type DocumentType, UserDocument } from "@/types";

interface MoveToDialogProps {
  open: boolean;
  onClose: () => void;
  userDocument: UserDocument;
}

const MoveToDialog: React.FC<MoveToDialogProps> = (
  { open, onClose, userDocument },
) => {
  const dispatch = useDispatch();
  const documents = useSelector((state) => state.documents);
  const [loading, setLoading] = useState(false);
  const [currentDirectoryId, setCurrentDirectoryId] = useState<string | null>(
    null,
  );
  const [directories, setDirectories] = useState<UserDocument[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<
    { id: string | null; name: string }[]
  >([]);

  const document = userDocument?.local || userDocument?.cloud;
  const documentId = userDocument.id;
  const documentName = document?.name || "Document";
  const documentType = document?.type || ("DOCUMENT" as DocumentType);
  const currentParentId = document?.parentId || null;

  // Function to determine if a document is at the root level
  const isRootLevel = (doc: UserDocument) => {
    const localParentId = doc.local?.parentId;
    const cloudParentId = doc.cloud?.parentId;
    return localParentId === null || localParentId === undefined ||
      cloudParentId === null || cloudParentId === undefined;
  };

  // Initialize directories when dialog opens
  useEffect(() => {
    if (open) {
      console.log("MoveToDialog opened, loading root directories");
      loadDirectories(null); // Start at root
    }
  }, [open]);

  // Function to load directories at a specific level
  const loadDirectories = (directoryId: string | null) => {
    try {
      setLoading(true);
      setCurrentDirectoryId(directoryId);

      // Check if documents is properly initialized
      if (!Array.isArray(documents)) {
        console.error("Documents is not an array:", documents);
        setDirectories([]);
        setBreadcrumbs([{ id: null, name: "Root" }]);
        setLoading(false);
        return;
      }

      console.log("Loading directories for parent ID:", directoryId);
      console.log("Total documents:", documents.length);

      // Since directories are no longer used in blog structure,
      // this dialog should not be used for moving documents
      const allDirectories: UserDocument[] = [];

      console.log("All directories:", allDirectories.length);

      // Filter directories at the current level
      const directoriesAtLevel = allDirectories.filter((dir) => {
        const parentId = dir.local?.parentId || dir.cloud?.parentId;
        // When at the root level, show all directories without a parent (parentId is null or undefined)
        // Otherwise, show only directories with parentId matching the current directoryId
        return directoryId === null
          ? parentId === null || parentId === undefined
          : parentId === directoryId;
      });

      console.log(
        "Directories at this level:",
        directoriesAtLevel.length,
      );

      setDirectories(directoriesAtLevel);

      // Build breadcrumb trail
      const buildBreadcrumbs = (
        dirId: string | null,
        trail: { id: string | null; name: string }[] = [],
      ) => {
        if (dirId === null) {
          return [{ id: null, name: "Root" }];
        }

        const dir = documents.find((d) => d.id === dirId);
        if (!dir) return [{ id: null, name: "Root" }];

        const name = dir.local?.name || dir.cloud?.name || "Directory";
        const parentId = dir.local?.parentId || dir.cloud?.parentId;

        const newTrail = [{ id: dirId, name }, ...trail];

        if (parentId) {
          return buildBreadcrumbs(parentId, newTrail);
        }

        return [{ id: null, name: "Root" }, ...newTrail];
      };

      if (directoryId) {
        setBreadcrumbs(buildBreadcrumbs(directoryId));
      } else {
        setBreadcrumbs([{ id: null, name: "Root" }]);
      }
    } catch (error) {
      console.error("Error loading directories:", error);
      // Set empty directories to prevent UI from breaking
      setDirectories([]);
      setBreadcrumbs([{ id: null, name: "Root" }]);
    } finally {
      setLoading(false);
    }
  };

  // Check if a directory is a child of another directory
  const isChildOf = (
    directoryId: string,
    potentialParentId: string,
  ): boolean => {
    try {
      // Safety check for documents array
      if (!Array.isArray(documents)) return false;

      const directory = documents.find((doc) => doc && doc.id === directoryId);
      if (!directory) return false;

      const parentId = directory.local?.parentId ||
        directory.cloud?.parentId;

      if (!parentId) return false;
      if (parentId === potentialParentId) return true;

      // Prevent infinite recursion by checking recursion depth
      // This is a safety measure in case there's a circular reference in the data
      const MAX_RECURSION_DEPTH = 10;
      const checkChildWithDepth = (
        dirId: string,
        potParentId: string,
        depth: number,
      ): boolean => {
        if (depth >= MAX_RECURSION_DEPTH) {
          console.warn(
            "Max recursion depth reached in isChildOf check",
          );
          return false;
        }

        const dir = documents.find((d) => d && d.id === dirId);
        if (!dir) return false;

        const pId = dir.local?.parentId || dir.cloud?.parentId;

        if (!pId) return false;
        if (pId === potParentId) return true;

        return checkChildWithDepth(pId, potParentId, depth + 1);
      };

      return checkChildWithDepth(parentId, potentialParentId, 0);
    } catch (error) {
      console.error("Error in isChildOf function:", error);
      return false;
    }
  };

  const handleDirectoryClick = (directoryId: string) => {
    loadDirectories(directoryId);
  };

  const handleBreadcrumbClick = (directoryId: string | null) => {
    loadDirectories(directoryId);
  };

  const handleMove = async () => {
    if (currentDirectoryId === currentParentId) {
      onClose();
      return;
    }

    setLoading(true);

    try {
      console.log("Moving document to new location:", currentDirectoryId);

      // Update the document's parentId
      if (userDocument.local) {
        await dispatch(actions.updateLocalDocument({
          id: documentId,
          partial: {
            parentId: currentDirectoryId,
          },
        }));
      }

      if (userDocument.cloud) {
        await dispatch(actions.updateCloudDocument({
          id: documentId,
          partial: {
            parentId: currentDirectoryId,
          },
        }));
      }

      // Show success message
      const targetDir = currentDirectoryId
        ? documents.find((doc) => doc.id === currentDirectoryId)
        : null;

      const targetDirName = targetDir
        ? (targetDir.local?.name || targetDir.cloud?.name ||
          "directory")
        : "Root";

      dispatch(actions.announce({
        message: {
          title: `Moved ${documentName} to ${targetDirName}`,
        },
        timeout: 3000,
      }));

      onClose();
    } catch (error) {
      console.error("Error moving document:", error);
      dispatch(actions.announce({
        message: {
          title: "Failed to move item",
          subtitle: "An error occurred while moving the item",
        },
        timeout: 3000,
      }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={(event, reason) => {
        // Only close the dialog when explicitly clicking the close button
        // This prevents the dialog from closing when clicking outside or pressing Escape
        if (reason === "backdropClick" || reason === "escapeKeyDown") {
          console.log("Preventing dialog close from:", reason);
          return;
        }
        onClose();
      }}
      maxWidth="sm"
      fullWidth
      aria-labelledby="move-dialog-title"
      disableEscapeKeyDown
      keepMounted
      data-testid="move-dialog"
    >
      <DialogTitle id="move-dialog-title">
        Move Document: {documentName}
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Select destination folder:
          </Typography>

          <Paper variant="outlined" sx={{ p: 1, mb: 2 }}>
            <Breadcrumbs aria-label="directory navigation breadcrumbs">
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;

                if (isLast) {
                  return (
                    <Typography
                      key={crumb.id || "root"}
                      color="text.primary"
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        fontWeight: "medium",
                      }}
                    >
                      {crumb.id === null
                        ? (
                          <HomeIcon
                            sx={{
                              mr: 0.5,
                              fontSize: "1rem",
                            }}
                          />
                        )
                        : (
                          <Folder
                            sx={{
                              mr: 0.5,
                              fontSize: "1rem",
                            }}
                          />
                        )}
                      {crumb.name}
                    </Typography>
                  );
                }

                return (
                  <Link
                    key={crumb.id || "root"}
                    component="button"
                    underline="hover"
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      color: "text.primary",
                    }}
                    onClick={() => handleBreadcrumbClick(crumb.id)}
                  >
                    {crumb.id === null
                      ? (
                        <HomeIcon
                          sx={{
                            mr: 0.5,
                            fontSize: "1rem",
                          }}
                        />
                      )
                      : (
                        <Folder
                          sx={{
                            mr: 0.5,
                            fontSize: "1rem",
                          }}
                        />
                      )}
                    {crumb.name}
                  </Link>
                );
              })}
            </Breadcrumbs>
          </Paper>

          {loading
            ? (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  p: 3,
                }}
              >
                <CircularProgress size={40} />
              </Box>
            )
            : directories.length > 0
            ? (
              <List>
                {directories.map((directory) => {
                  const dirName = directory.local?.name ||
                    directory.cloud?.name || "Directory";
                  const isCurrentParent = directory.id === currentParentId;

                  return (
                    <ListItem
                      key={directory.id}
                      disablePadding
                    >
                      <ListItemButton
                        onClick={() =>
                          handleDirectoryClick(
                            directory.id,
                          )}
                        sx={{
                          borderRadius: 1,
                          ...(isCurrentParent && {
                            bgcolor: "action.selected",
                          }),
                        }}
                      >
                        <ListItemIcon>
                          <Folder
                            color={isCurrentParent ? "primary" : "inherit"}
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={dirName}
                          primaryTypographyProps={{
                            fontWeight: isCurrentParent ? "medium" : "regular",
                          }}
                        />
                        <ArrowForward
                          fontSize="small"
                          color="action"
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            )
            : (
              <Box sx={{ p: 2, textAlign: "center" }}>
                <Typography color="text.secondary">
                  No folders found at this level
                </Typography>
              </Box>
            )}

          {currentDirectoryId && (
            <Box sx={{ mt: 2 }}>
              <Button
                startIcon={<ArrowBack />}
                onClick={() => {
                  const parentIndex = breadcrumbs.length - 2;
                  if (parentIndex >= 0) {
                    handleBreadcrumbClick(
                      breadcrumbs[parentIndex].id,
                    );
                  }
                }}
                size="small"
              >
                Back to parent folder
              </Button>
            </Box>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box>
          <Typography variant="body2" color="text.secondary">
            Current location: {currentParentId
              ? documents.find((doc) => doc.id === currentParentId)?.local
                ?.name ||
                documents.find((doc) => doc.id === currentParentId)?.cloud
                  ?.name ||
                "Unknown"
              : "Root"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            New location: {currentDirectoryId
              ? documents.find((doc) =>
                doc.id === currentDirectoryId
              )?.local?.name ||
                documents.find((doc) => doc.id === currentDirectoryId)?.cloud
                  ?.name ||
                "Unknown"
              : "Root"}
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} data-testid="move-cancel-button">
          Cancel
        </Button>
        <Button
          onClick={handleMove}
          variant="contained"
          color="primary"
          disabled={loading || currentDirectoryId === currentParentId}
          data-testid="move-confirm-button"
        >
          {loading ? "Moving..." : "Move"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MoveToDialog;
