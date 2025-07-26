import { LocalDocumentRevision, User, UserDocumentRevision } from "@/types";
import RevisionCard from "./EditRevisionCard";
import { actions, useDispatch, useSelector } from "@/store";
import Grid from "@mui/material/Grid2";
import {
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  IconButton,
  Portal,
  Typography,
} from "@mui/material";
import {
  CheckCircle,
  Close,
  Compare,
  History,
  PlayArrow,
  Preview,
} from "@mui/icons-material";
import type { LexicalEditor } from "lexical";
import { RefObject } from "react";
import RouterLink from "next/link";
import ShareDocument from "../DocumentActions/Share";
import DownloadDocument from "../DocumentActions/Download";
import ForkDocument from "../DocumentActions/Fork";
import EditDocument from "../DocumentActions/Edit";
import AppDrawer from "../AppDrawer";

export default function EditDocumentInfo(
  { editorRef, documentId }: {
    editorRef: RefObject<LexicalEditor | null>;
    documentId: string;
  },
) {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);
  const userDocument = useSelector((state) =>
    state.documents.find((d) => d.id === documentId)
  );
  const localDocument = userDocument?.local;
  const cloudDocument = userDocument?.cloud;
  const isCloud = !!cloudDocument;
  const localDocumentRevisions = localDocument?.revisions ?? [];
  const cloudDocumentRevisions = cloudDocument?.revisions ?? [];
  const isHeadLocalRevision = localDocumentRevisions.some((r) =>
    r.id === localDocument?.head
  );
  const isHeadCloudRevision = cloudDocumentRevisions.some((r) =>
    r.id === localDocument?.head
  );
  const isAuthor = isCloud ? cloudDocument.author.id === user?.id : true;
  const isCollab = isCloud && cloudDocument.collab;
  const collaborators = isCollab
    ? cloudDocument.revisions.reduce((acc, rev) => {
      if (
        (rev as any).author?.id !== cloudDocument.author.id &&
        !cloudDocument.coauthors.some((u) =>
          u.id === (rev as any).author?.id
        ) &&
        !acc.find((u) => u.id === (rev as any).author?.id)
      ) acc.push((rev as any).author);
      return acc;
    }, [] as User[])
    : [];

  const revisions: UserDocumentRevision[] = [...cloudDocumentRevisions];
  localDocumentRevisions.forEach((revision) => {
    if (!cloudDocumentRevisions.some((r) => r.id === revision.id)) {
      revisions.push(revision as any);
    }
  });
  const documentRevisions = [...revisions].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const unsavedChanges = !isHeadLocalRevision && !isHeadCloudRevision;
  if (unsavedChanges && localDocument) {
    const unsavedRevision = {
      id: localDocument.head,
      documentId: localDocument.id,
      createdAt: localDocument.updatedAt,
      author: user ||
        {
          id: "",
          name: "Local User",
          email: "",
          handle: null,
          image: null,
        },
    } as UserDocumentRevision;
    documentRevisions.unshift(unsavedRevision);
  }

  // Remove revisions badge content
  const showRevisionsBadge = false;

  const isDiffViewOpen = useSelector((state) => state.ui.diff.open);
  const toggleDiffView = async () => {
    if (unsavedChanges) await createLocalRevision();
    const newRevisionId = documentRevisions[0]?.id;
    const oldRevisionId = documentRevisions[1]?.id ?? newRevisionId;
    dispatch(
      actions.setDiff({
        open: !isDiffViewOpen,
        old: oldRevisionId,
        new: newRevisionId,
      }),
    );
  };

  const viewLocalDocument = async () => {
    if (isDiffViewOpen) return dispatch(actions.setDiff({ open: false }));
    if (unsavedChanges) await createLocalRevision();
    dispatch(
      actions.setDiff({
        open: true,
        old: localDocument?.head,
        new: localDocument?.head,
      }),
    );
  };

  const getLocalEditorData = () => editorRef.current?.getEditorState().toJSON();

  const createLocalRevision = async () => {
    if (!localDocument) return;
    const data = getLocalEditorData();
    if (!data) return;
    const payload = {
      id: localDocument.head,
      documentId: localDocument.id,
      createdAt: localDocument.updatedAt,
      data,
    };
    const response = await dispatch(actions.createLocalRevision(payload));
    if (response.type === actions.createLocalRevision.rejected.type) return;
    return response.payload as ReturnType<
      typeof actions.createLocalRevision.fulfilled
    >["payload"];
  };

  return (
    <>
      <AppDrawer title="Document Info">
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "start",
            justifyContent: "start",
            gap: 1,
            my: 3,
          }}
        >
          {localDocument && (
            <>
              <Typography component="h2" variant="h6">
                {localDocument.name}
              </Typography>
              {localDocument.status && localDocument.status !== "NEUTRAL" && (
                <Chip
                  size="small"
                  icon={localDocument.status === "ACTIVE"
                    ? <PlayArrow />
                    : <CheckCircle />}
                  label={localDocument.status === "ACTIVE" ? "Active" : "Done"}
                  sx={{
                    backgroundColor: localDocument.status === "ACTIVE"
                      ? "#e3f2fd"
                      : "#e8f5e8",
                    color: localDocument.status === "ACTIVE"
                      ? "#1976d2"
                      : "#2e7d32",
                    borderColor: localDocument.status === "ACTIVE"
                      ? "#2196f3"
                      : "#4caf50",
                    fontWeight: "bold",
                  }}
                  variant="outlined"
                />
              )}
              <Typography
                variant="subtitle2"
                color="text.secondary"
              >
                Created: {new Date(localDocument.createdAt)
                  .toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
              </Typography>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                gutterBottom
              >
                Updated: {new Date(localDocument.updatedAt)
                  .toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
              </Typography>
              {!cloudDocument && (
                <Typography variant="subtitle2">
                  Author{" "}
                  <Chip
                    avatar={<Avatar />}
                    label={user?.name ?? "Local User"}
                    variant="outlined"
                  />
                </Typography>
              )}
            </>
          )}
          {cloudDocument && (
            <>
              <Typography variant="subtitle2">
                Author{" "}
                <Chip
                  clickable
                  component={RouterLink}
                  prefetch={false}
                  href={`/user/${
                    cloudDocument.author.handle ||
                    cloudDocument.author.id
                  }`}
                  avatar={
                    <Avatar
                      alt={cloudDocument.author.name}
                      src={cloudDocument.author.image ||
                        undefined}
                    />
                  }
                  label={cloudDocument.author.name}
                  variant="outlined"
                />
              </Typography>
              {cloudDocument.coauthors.length > 0 && (
                <>
                  <Typography
                    component="h3"
                    variant="subtitle2"
                  >
                    Coauthors
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 1,
                    }}
                  >
                    {cloudDocument.coauthors.map(
                      (coauthor) => (
                        <Chip
                          clickable
                          component={RouterLink}
                          prefetch={false}
                          href={`/user/${
                            coauthor.handle ||
                            coauthor.id
                          }`}
                          key={coauthor.id}
                          avatar={
                            <Avatar
                              alt={coauthor.name}
                              src={coauthor
                                .image ||
                                undefined}
                            />
                          }
                          label={coauthor.name}
                          variant="outlined"
                        />
                      ),
                    )}
                  </Box>
                </>
              )}
              {collaborators.length > 0 && (
                <>
                  <Typography
                    component="h3"
                    variant="subtitle2"
                  >
                    Collaborators
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 1,
                    }}
                  >
                    {collaborators.map((user) => (
                      <Chip
                        clickable
                        component={RouterLink}
                        prefetch={false}
                        href={`/user/${user.handle || user.id}`}
                        key={user.id}
                        avatar={
                          <Avatar
                            alt={user.name}
                            src={user.image ||
                              undefined}
                          />
                        }
                        label={user.name}
                        variant="outlined"
                      />
                    ))}
                  </Box>
                </>
              )}
            </>
          )}
          {userDocument && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mt: 2,
                alignSelf: "flex-end",
              }}
            >
              <IconButton
                aria-label="View"
                onClick={async () => {
                  // If we have unsaved changes, make sure to save to cloud before viewing
                  if (unsavedChanges) {
                    const data = getLocalEditorData();
                    if (data) {
                      // First create local revision
                      await createLocalRevision();

                      // Then save to cloud
                      if (isAuthor && localDocument) {
                        try {
                          // Create revision in cloud
                          const revision = {
                            id: localDocument.head,
                            documentId: localDocument.id,
                            createdAt: localDocument.updatedAt,
                            data,
                          };

                          const revisionResponse = await dispatch(
                            actions.createCloudRevision(revision),
                          );
                          if (
                            revisionResponse.type ===
                              actions.createCloudRevision.fulfilled.type
                          ) {
                            // Update document in cloud
                            await dispatch(actions.updateCloudDocument({
                              id: localDocument.id,
                              partial: {
                                head: localDocument.head,
                                updatedAt: localDocument.updatedAt,
                                parentId: localDocument.parentId, // Preserve parentId when updating
                              },
                            }));
                            console.log(
                              "Document saved to cloud before viewing",
                            );
                          }
                        } catch (error) {
                          console.error(
                            "Failed to save to cloud before viewing:",
                            error,
                          );
                        }
                      }
                    }
                  }

                  // Then view the document
                  viewLocalDocument();
                }}
                sx={isDiffViewOpen
                  ? {
                    color: "primary.contrastText",
                    backgroundColor: "primary.main",
                    "&:hover": {
                      backgroundColor: "primary.dark",
                    },
                  }
                  : undefined}
              >
                <Preview />
              </IconButton>
              <ShareDocument userDocument={userDocument} />
              <ForkDocument userDocument={userDocument} />
              <DownloadDocument userDocument={userDocument} />
              {isAuthor && <EditDocument userDocument={userDocument} />}
            </Box>
          )}
        </Box>
        <Grid container spacing={1}>
          <Grid
            size={{ xs: 12 }}
            sx={{ display: "flex", alignItems: "center" }}
          >
            <History sx={{ mr: 1 }} />
            <Typography variant="h6">Revisions</Typography>
            <Button
              sx={{ ml: "auto" }}
              onClick={async () => {
                if (isDiffViewOpen) {
                  // If we're exiting the diff view, save the latest revision to the cloud if there are unsaved changes
                  if (unsavedChanges && localDocument) {
                    // Get the editor data
                    const editorData = getLocalEditorData();

                    // Only proceed if we have valid editor data
                    if (editorData) {
                      // Create a cloud revision before toggling the diff view
                      const revision = {
                        id: localDocument.head,
                        documentId: localDocument.id,
                        createdAt: localDocument.updatedAt,
                        data: editorData,
                      };
                      try {
                        // First save the revision
                        const revisionResponse = await dispatch(
                          actions.createCloudRevision(revision),
                        );
                        if (
                          revisionResponse.type ===
                            actions.createCloudRevision.fulfilled.type
                        ) {
                          // Then update the document
                          await dispatch(actions.updateCloudDocument({
                            id: localDocument.id,
                            partial: {
                              head: localDocument.head,
                              updatedAt: localDocument.updatedAt,
                              parentId: localDocument.parentId, // Preserve parentId when updating
                            },
                          }));
                          console.log(
                            "Document saved to cloud when exiting diff view",
                          );
                        }
                      } catch (error) {
                        console.error("Failed to save to cloud:", error);
                      }
                    }
                  }
                }
                toggleDiffView();
              }}
              endIcon={isDiffViewOpen ? <Close /> : <Compare />}
            >
              {isDiffViewOpen ? "Exit" : "Compare"}
            </Button>
          </Grid>
          {documentRevisions.map((revision) => (
            <Grid size={{ xs: 12 }} key={revision.id}>
              <RevisionCard
                revision={revision}
                editorRef={editorRef}
              />
            </Grid>
          ))}
        </Grid>
      </AppDrawer>
      {/* Removed revision badge */}
    </>
  );
}
