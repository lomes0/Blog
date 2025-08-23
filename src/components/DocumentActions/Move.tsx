"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Divider,
  Link,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Popover,
  Typography,
} from "@mui/material";
import {
  ArrowBack,
  ArrowForward,
  DriveFileMove,
  Folder,
  Home as HomeIcon,
} from "@mui/icons-material";
import { actions, useDispatch, useSelector } from "@/store";
import { type DocumentType, UserDocument } from "@/types";

interface MoveProps {
  userDocument: UserDocument;
  variant?: "menuitem" | "button";
  closeMenu?: () => void;
}

const Move: React.FC<MoveProps> = (
  { userDocument, variant = "menuitem", closeMenu },
) => {
  const dispatch = useDispatch();
  const documents = useSelector((state) => state.documents);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentDirectoryId, setCurrentDirectoryId] = useState<string | null>(
    null,
  );
  const [directories, setDirectories] = useState<UserDocument[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<
    { id: string | null; name: string }[]
  >([]);
  const menuItemRef = useRef<HTMLLIElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const document = userDocument?.local || userDocument?.cloud;
  const documentId = userDocument.id;
  const documentName = document?.name || "Document";
  const documentType = document?.type || ("DOCUMENT" as DocumentType);
  const currentParentId = document?.parentId || null;

  const open = Boolean(anchorEl);

  // Function to determine if a document is a directory
  // In blog structure, there are no directories
  const isDirectory = (doc: UserDocument) => {
    return false; // No directories in blog structure
  };

  // Function to determine if a document is at the root level
  const isRootLevel = (doc: UserDocument) => {
    const localParentId = doc.local?.parentId;
    const cloudParentId = doc.cloud?.parentId;
    return localParentId === null || localParentId === undefined ||
      cloudParentId === null || cloudParentId === undefined;
  };

  // Initialize directories when popover opens
  useEffect(() => {
    if (open) {
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
        setDirectories([]);
        setBreadcrumbs([{ id: null, name: "Root" }]);
        setLoading(false);
        return;
      }

      // Filter all directories from the documents list
      const allDirectories = documents.filter((doc) => {
        if (!doc) return false;

        // Check if it's a directory
        const isDir = isDirectory(doc);

        // Don't include the current document if it's a directory (can't move into itself)
        const isNotSelf = doc.id !== documentId;

        // Check if this directory is a child of the current document (if document is a directory)
        // This prevents circular references
        const isNotChild = !isChildOf(doc.id, documentId);

        return isDir && isNotSelf && isNotChild;
      });

      // Filter directories at the current level
      const directoriesAtLevel = allDirectories.filter((dir) => {
        const parentId = dir.local?.parentId || dir.cloud?.parentId;
        // When at the root level, show all directories without a parent
        // Otherwise, show only directories with parentId matching the current directoryId
        return directoryId === null
          ? isRootLevel(dir)
          : parentId === directoryId;
      });

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
      const MAX_RECURSION_DEPTH = 10;
      const checkChildWithDepth = (
        dirId: string,
        potParentId: string,
        depth: number,
      ): boolean => {
        if (depth >= MAX_RECURSION_DEPTH) return false;

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

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation(); // Prevent event bubbling
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setCurrentDirectoryId(null);
    setDirectories([]);
    setBreadcrumbs([]);

    // Close the menu after the popover is closed
    if (closeMenu) {
      closeMenu();
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
      handleClose();
      return;
    }

    setLoading(true);

    try {
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

      handleClose();
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

  // Render the component
  return (
    <>
      {variant === "menuitem"
        ? (
          <MenuItem
            onClick={handleOpen}
            data-testid="move-menu-item"
            ref={menuItemRef}
          >
            <ListItemIcon>
              <DriveFileMove fontSize="small" />
            </ListItemIcon>
            <ListItemText>Move to...</ListItemText>
          </MenuItem>
        )
        : (
          <Button
            startIcon={<DriveFileMove />}
            onClick={handleOpen}
            variant="outlined"
            size="small"
            data-testid="move-button"
            ref={buttonRef}
          >
            Move to
          </Button>
        )}

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "center",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "center",
          horizontal: "left",
        }}
        PaperProps={{
          sx: {
            width: 400,
            maxHeight: 500,
            p: 2,
            overflow: "hidden",
          },
          onClick: (e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation(), // Prevent clicks inside from bubbling up
        }}
        data-testid="move-popover"
        disableRestoreFocus
      >
        <Typography variant="h6" gutterBottom>
          Move Document: {documentName}
        </Typography>

        <Box sx={{ mb: 2, overflow: "auto", maxHeight: 350 }}>
          <Typography variant="subtitle2" gutterBottom>
            Select destination folder:
          </Typography>

          <Paper variant="outlined" sx={{ p: 1, mb: 2 }}>
            <Breadcrumbs
              aria-label="directory navigation breadcrumbs"
              maxItems={3}
            >
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
                        fontSize: "0.875rem",
                      }}
                    >
                      {crumb.id === null
                        ? (
                          <HomeIcon
                            sx={{
                              mr: 0.5,
                              fontSize: "0.875rem",
                            }}
                          />
                        )
                        : (
                          <Folder
                            sx={{
                              mr: 0.5,
                              fontSize: "0.875rem",
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
                    underline="hover"
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      color: "text.primary",
                      fontSize: "0.875rem",
                      cursor: "pointer",
                    }}
                    onClick={() => handleBreadcrumbClick(crumb.id)}
                  >
                    {crumb.id === null
                      ? (
                        <HomeIcon
                          sx={{
                            mr: 0.5,
                            fontSize: "0.875rem",
                          }}
                        />
                      )
                      : (
                        <Folder
                          sx={{
                            mr: 0.5,
                            fontSize: "0.875rem",
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
                  p: 2,
                }}
              >
                <CircularProgress size={32} />
              </Box>
            )
            : (
              <>
                {/* Option to select current directory */}
                <ListItem
                  disablePadding
                  sx={{
                    mb: 2,
                    border: "2px solid",
                    borderColor: "primary.main",
                    borderRadius: 1,
                    bgcolor: "action.selected",
                  }}
                >
                  <ListItemButton
                    onClick={handleMove}
                    sx={{
                      borderRadius: 1,
                      py: 1,
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Folder
                        color="primary"
                        fontSize="small"
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={`Move to: ${
                        breadcrumbs[
                          breadcrumbs.length - 1
                        ]?.name || "Root"
                      }`}
                      primaryTypographyProps={{
                        fontWeight: "medium",
                        fontSize: "0.875rem",
                      }}
                    />
                  </ListItemButton>
                </ListItem>

                {/* Divider if there are subdirectories */}
                {directories.length > 0 && <Divider sx={{ my: 1 }} />}

                {/* List of subdirectories */}
                {directories.length > 0
                  ? (
                    <List dense disablePadding>
                      {directories.map((directory) => {
                        const dirName = directory.local?.name ||
                          directory.cloud?.name ||
                          "Directory";
                        const isCurrentParent = directory.id ===
                          currentParentId;

                        return (
                          <ListItem
                            key={directory.id}
                            disablePadding
                          >
                            <ListItemButton
                              onClick={() =>
                                handleDirectoryClick(
                                  directory
                                    .id,
                                )}
                              sx={{
                                borderRadius: 1,
                                py: 0.5,
                                "&:hover": {
                                  bgcolor: "action.hover",
                                },
                                ...(isCurrentParent &&
                                  {
                                    bgcolor: "action.selected",
                                  }),
                              }}
                            >
                              <ListItemIcon
                                sx={{
                                  minWidth: 36,
                                }}
                              >
                                <Folder
                                  color={isCurrentParent
                                    ? "primary"
                                    : "inherit"}
                                  fontSize="small"
                                />
                              </ListItemIcon>
                              <ListItemText
                                primary={dirName}
                                primaryTypographyProps={{
                                  fontWeight: isCurrentParent
                                    ? "medium"
                                    : "regular",
                                  fontSize: "0.875rem",
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
                      <Typography
                        color="text.secondary"
                        variant="body2"
                      >
                        No subfolders found
                      </Typography>
                    </Box>
                  )}
              </>
            )}

          {currentDirectoryId && (
            <Box sx={{ mt: 1 }}>
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
                Back
              </Button>
            </Box>
          )}
        </Box>

        <Divider sx={{ my: 1 }} />

        <Box
          sx={{
            mt: 2,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <Button
            onClick={handleClose}
            size="small"
            data-testid="move-cancel-button"
          >
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            variant="contained"
            color="primary"
            size="small"
            disabled={loading}
            data-testid="move-confirm-button"
          >
            {loading ? "Moving..." : "Move Here"}
          </Button>
        </Box>
      </Popover>
    </>
  );
};

export default Move;
