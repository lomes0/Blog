"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@mui/material/styles";
import { actions, useDispatch, useSelector } from "@/store";
import {
  Alert,
  Box,
  Button,
  Card,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Typography,
} from "@mui/material";
import {
  Add,
  Delete,
  Description,
  Edit,
  Folder,
  LibraryBooks,
  MoreVert,
  NoteAdd,
  Settings,
} from "@mui/icons-material";
import { Document, Domain, User } from "@prisma/client";

type DocumentWithAuthor = Document & {
  author: Pick<User, "id" | "name" | "email" | "image" | "handle">;
  _count: {
    children: number;
  };
};

type DomainWithUser = Domain & {
  user: Pick<User, "id" | "name" | "email" | "image" | "handle">;
};

interface DomainViewProps {
  domain: DomainWithUser;
  documents: DocumentWithAuthor[];
  currentUser: any; // Using any for session user type
}

export default function DomainView(
  { domain, documents, currentUser }: DomainViewProps,
) {
  const router = useRouter();
  const theme = useTheme();
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const isMenuOpen = Boolean(menuAnchorEl);
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const user = useSelector((state) => state.user);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

  // Check if we need to redirect based on authentication state
  useEffect(() => {
    if (user) {
      // If we have a user in Redux but it doesn't match the domain owner
      if (domain.userId !== user.id) {
        console.log("Access denied: user doesn't own this domain");
        router.push("/");
        return;
      }
      setAuthLoading(false);
    } else if (currentUser && currentUser.id === domain.userId) {
      // We have a valid currentUser from props, no need to redirect
      setAuthLoading(false);
    } else {
      // Give a short delay to allow client-side auth to complete
      const timer = setTimeout(() => {
        if (!user) {
          console.log("No authenticated user found, redirecting to login");
          router.push("/api/auth/signin");
        }
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [user, domain, router, currentUser]);
  useEffect(() => {
    // Track loading state
    setIsLoading(true);

    // Ensure domains are loaded in Redux store
    dispatch(actions.fetchUserDomains())
      .unwrap()
      .then((domains) => {
        console.log("Domains loaded in DomainView:", domains?.length || 0);
      })
      .catch((err) => {
        console.error("Error loading domains in DomainView:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [dispatch, authLoading]);

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchorEl(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setMenuAnchorEl(null);
  };

  const handleEditDomain = () => {
    router.push(`/domains/edit/${domain.id}`);
    handleCloseMenu();
  };

  const handleCreateDocument = () => {
    router.push(`/new?domain=${domain.id}`);
  };

  const handleCreateDirectory = () => {
    router.push(`/new-directory?domain=${domain.id}`);
  };

  const handleDeleteDomain = async () => {
    if (!domain.id) return;

    try {
      setIsDeleting(true);
      await dispatch(actions.deleteDomain(domain.id)).unwrap();

      setSnackbar({
        open: true,
        message:
          `Domain "${domain.name}" and all its documents have been deleted`,
        severity: "success",
      });

      // Redirect to home page after successful deletion
      setTimeout(() => {
        router.push("/");
      }, 1500);
    } catch (err: any) {
      console.error("Error deleting domain:", err);
      setSnackbar({
        open: true,
        message: err.subtitle || err.message || "Failed to delete domain",
        severity: "error",
      });
      setDeleteDialogOpen(false);
      setIsDeleting(false);
    }
  };

  // Helper function to determine icon background color
  const getIconBackgroundColor = () => {
    return domain.color || theme.palette.primary.main;
  };

  // Helper function to render document icon based on type
  const renderDocumentIcon = (document: DocumentWithAuthor) => {
    if (document.type === "DIRECTORY") {
      return <Folder />;
    }
    return <Description />;
  };

  // Helper function to get document link based on type
  const getDocumentLink = (document: DocumentWithAuthor) => {
    if (document.type === "DIRECTORY") {
      return `/browse/${document.id}`;
    }
    return `/view/${document.id}`;
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 8 }}>
      {isLoading || authLoading
        ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "50vh",
            }}
          >
            <Typography variant="h6" gutterBottom>
              Loading domain data...
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Please wait while we load your domain information
            </Typography>
          </Box>
        )
        : (
          <>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                mb: 3,
                justifyContent: "space-between",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: getIconBackgroundColor(),
                    color: "#fff",
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    mr: 2,
                  }}
                >
                  <LibraryBooks sx={{ fontSize: "1.5rem" }} />
                </Box>
                <Box>
                  <Typography variant="h4" component="h1">
                    {domain.name}
                  </Typography>
                  {domain.description && (
                    <Typography variant="body1" color="text.secondary">
                      {domain.description}
                    </Typography>
                  )}
                </Box>
              </Box>

              <Box>
                <IconButton onClick={handleOpenMenu} size="large">
                  <MoreVert />
                </IconButton>
                <Menu
                  anchorEl={menuAnchorEl}
                  open={isMenuOpen}
                  onClose={handleCloseMenu}
                  transformOrigin={{ horizontal: "right", vertical: "top" }}
                  anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
                >
                  <MenuItem onClick={handleEditDomain}>
                    <ListItemIcon>
                      <Settings fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Domain Settings</ListItemText>
                  </MenuItem>
                  <Divider />
                  <MenuItem
                    onClick={() => {
                      handleCloseMenu();
                      setDeleteDialogOpen(true);
                    }}
                    sx={{ color: "error.main" }}
                  >
                    <ListItemIcon>
                      <Delete fontSize="small" color="error" />
                    </ListItemIcon>
                    <ListItemText>Delete Domain</ListItemText>
                  </MenuItem>
                </Menu>
              </Box>
            </Box>

            <Paper
              sx={{ mb: 4, p: 2, display: "flex", justifyContent: "flex-end" }}
            >
              <Button
                variant="outlined"
                startIcon={<Folder />}
                onClick={handleCreateDirectory}
                sx={{ mr: 2 }}
              >
                New Directory
              </Button>
              <Button
                variant="contained"
                startIcon={<NoteAdd />}
                onClick={handleCreateDocument}
              >
                New Document
              </Button>
            </Paper>

            {documents.length === 0
              ? (
                <Card sx={{ p: 4, textAlign: "center" }}>
                  <LibraryBooks
                    sx={{ fontSize: 60, color: "text.secondary", mb: 2 }}
                  />
                  <Typography variant="h6" gutterBottom>
                    No Documents Yet
                  </Typography>
                  <Typography variant="body1" color="text.secondary" paragraph>
                    This domain doesn't have any documents yet. Create your
                    first document to get started.
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={handleCreateDocument}
                    sx={{ mt: 2 }}
                  >
                    Create Document
                  </Button>
                </Card>
              )
              : (
                <Grid container spacing={2}>
                  {documents.map((doc) => (
                    <Grid item xs={12} sm={6} md={4} key={doc.id}>
                      <Link
                        href={getDocumentLink(doc)}
                        style={{ textDecoration: "none" }}
                      >
                        <Card
                          sx={{
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            transition: "transform 0.2s, box-shadow 0.2s",
                            "&:hover": {
                              transform: "translateY(-4px)",
                              boxShadow: 4,
                            },
                          }}
                        >
                          <Box
                            sx={{
                              p: 2,
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            <ListItemIcon>
                              {renderDocumentIcon(doc)}
                            </ListItemIcon>
                            <Box sx={{ ml: 1 }}>
                              <Typography variant="h6" component="h2" noWrap>
                                {doc.name}
                              </Typography>
                              {doc.type === "DIRECTORY" && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  {doc._count.children}{" "}
                                  {doc._count.children === 1 ? "item" : "items"}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        </Card>
                      </Link>
                    </Grid>
                  ))}
                </Grid>
              )}
          </>
        )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => !isDeleting && setDeleteDialogOpen(false)}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">
          Delete Domain
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Are you sure you want to delete the domain "{domain.name}"? This
            will permanently delete the domain and all documents within it. This
            action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteDomain}
            color="error"
            autoFocus
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}
