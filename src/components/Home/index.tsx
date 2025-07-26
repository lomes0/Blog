"use client";
import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardMedia,
  Container,
  Divider,
  Paper,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import {
  Add,
  Cloud,
  Edit,
  FilterList,
  Folder,
  Functions,
  Share,
} from "@mui/icons-material";
import { BackupDocument, DocumentType, UserDocument } from "@/types";
import { actions, useDispatch, useSelector } from "@/store";
import DraggableDocumentCard from "../DocumentCard/DraggableDocumentCard";
import FilterControl from "../DocumentControls/FilterControl";
import DocumentSortControl from "../DocumentControls/SortControl";
import ImportExportControl from "../DocumentControls/ImportExportControl";
import { sortDocuments } from "../DocumentControls/sortDocuments";
import { filterDocuments } from "../DocumentControls/FilterControl";
import { v4 as uuid } from "uuid";
import documentDB, { revisionDB } from "@/indexeddb";
import NProgress from "nprogress"; // For progress indication
import { DragProvider } from "../DragContext";
import TrashBin from "../TrashBin";

const Home: React.FC<{ staticDocuments: UserDocument[] }> = (
  { staticDocuments },
) => {
  const dispatch = useDispatch();
  const documents = useSelector((state) => state.documents);
  const user = useSelector((state) => state.user);

  const [filteredDocuments, setFilteredDocuments] = useState<UserDocument[]>(
    [],
  );
  const [filterValue, setFilterValue] = useState(0);
  const [sortValue, setSortValue] = useState({
    key: "updatedAt",
    direction: "desc",
  });

  // Use documents from state if available, otherwise use static documents
  const allDocuments = documents.length > 0 ? documents : staticDocuments;

  // File import handling
  const handleFilesChange = async (
    files: FileList | File[] | null,
    createNewDirectory: boolean = false,
  ) => {
    if (!files?.length) return;

    let directoryId: string | null = null;
    let dirName = "New_Files";

    // Create a new directory to hold imported files if requested
    if (createNewDirectory) {
      directoryId = uuid();
      const now = new Date();
      const formattedDate = now.toLocaleDateString().replace(/\//g, "-");
      const formattedTime = now.toLocaleTimeString().replace(/:/g, "-").replace(
        / /g,
        "",
      );
      dirName = `New_Files_${formattedDate}_${formattedTime}`;

      dispatch(actions.createLocalDocument({
        id: directoryId,
        name: dirName,
        type: DocumentType.DIRECTORY,
        parentId: null, // Root level directory
        head: uuid(),
        data: {
          root: {
            children: [],
            direction: null,
            format: "left",
            indent: 0,
            type: "root",
            version: 1,
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sort_order: 0,
      }));

      dispatch(
        actions.announce({
          message: {
            title: `Creating '${dirName}' directory`,
            subtitle: "All imported files will be placed in this directory",
          },
        }),
      );
    }

    for (const file of files) {
      await loadFromFile(file, files.length === 1, directoryId);
    }

    // Show success notification after all files are imported
    if (createNewDirectory && files.length > 0) {
      dispatch(
        actions.announce({
          message: {
            title: "Import completed",
            subtitle:
              `${files.length} file(s) imported into '${dirName}' directory`,
          },
        }),
      );

      // If user is logged in, save all imported files to cloud
      if (user) {
        // Start progress indicator
        NProgress.start();

        dispatch(
          actions.announce({
            message: {
              title: "Saving to cloud",
              subtitle: "Uploading imported files to cloud storage...",
            },
          }),
        );

        try {
          // Save the directory to cloud first
          let successCount = 0;
          if (directoryId) {
            const success = await saveDocumentToCloud(directoryId);
            if (success) successCount++;

            // Get all documents with this directory as parent and save them to cloud
            const allDocs = await documentDB.getAll();
            const childDocs = allDocs.filter((doc) =>
              doc.parentId === directoryId
            );

            for (const doc of childDocs) {
              const success = await saveDocumentToCloud(doc.id);
              if (success) successCount++;
              // Add a small delay between uploads to prevent overwhelming the server
              await new Promise((resolve) => setTimeout(resolve, 300));
            }

            // Complete progress indicator
            NProgress.done();

            dispatch(
              actions.announce({
                message: {
                  title: "Cloud save completed",
                  subtitle: `Uploaded '${dirName}' directory and ${
                    successCount - 1
                  } file(s) to cloud storage`,
                },
              }),
            );
          }
        } catch (error) {
          console.error("Error during cloud save:", error);
          // Stop progress indicator on error
          NProgress.done();

          dispatch(
            actions.announce({
              message: {
                title: "Cloud save incomplete",
                subtitle:
                  "Some items may not have been saved to the cloud. Please try again later.",
              },
            }),
          );
        }
      }
    }
  };

  async function loadFromFile(
    file: File,
    shouldNavigate?: boolean,
    directoryId?: string | null,
  ) {
    const reader = new FileReader();
    reader.readAsText(file);
    await new Promise<void>((resolve) => {
      reader.onload = async () => {
        try {
          const data: BackupDocument | BackupDocument[] = JSON.parse(
            reader.result as string,
          );
          if (!Array.isArray(data)) {
            await addDocument(data, shouldNavigate, directoryId);
          } else {
            for (const document of data) {
              await addDocument(document, false, directoryId);
            }
          }
        } catch (error) {
          dispatch(
            actions.announce({
              message: {
                title: "Invalid file",
                subtitle: "Please select a valid .me file",
              },
            }),
          );
        } finally {
          resolve();
        }
      };
    });
  }

  async function addDocument(
    document: BackupDocument,
    shouldNavigate?: boolean,
    directoryId?: string | null,
  ) {
    const revisions = document.revisions || [];
    if (!document.head) document.head = uuid();
    const isHeadLocalRevision = !!revisions.find((revision) =>
      revision.id === document.head
    );
    if (!isHeadLocalRevision) {
      document.revisions = [
        {
          id: document.head,
          documentId: document.id,
          data: document.data,
          createdAt: document.updatedAt,
        },
        ...revisions,
      ];
    }

    // Set the parentId if a directory was created
    if (directoryId) {
      document.parentId = directoryId;
    }

    if (documents.find((d) => d.id === document.id && d.local)) {
      const alert = {
        title: `Document already exists`,
        content: `Do you want to overwrite ${document.name}?`,
        actions: [
          { label: "Cancel", id: uuid() },
          { label: "Overwrite", id: uuid() },
        ],
      };
      const response = await dispatch(actions.alert(alert));
      if (response.payload === alert.actions[1].id) {
        dispatch(
          actions.updateLocalDocument({
            id: document.id,
            partial: document,
          }),
        );
      }
    } else {
      dispatch(actions.createLocalDocument(document));
    }
  }

  // Function to save a document to the cloud
  async function saveDocumentToCloud(documentId: string) {
    if (!user) return false;

    try {
      const document = await documentDB.getByID(documentId);
      if (!document) return false;

      // Get all revisions for the document
      const revisions = await revisionDB.getManyByKey("documentId", documentId);

      // If the head revision is not in the revisions, create it
      const isHeadLocalRevision = revisions.some(
        (revision) => revision.id === document.head,
      );

      if (!isHeadLocalRevision) {
        const headRevision = {
          id: document.head,
          documentId: document.id,
          data: document.data,
          createdAt: document.updatedAt,
        };
        await dispatch(actions.createLocalRevision(headRevision));
      }

      // Create the document in the cloud
      const result = await dispatch(actions.createCloudDocument(document));

      // Verify the cloud upload was successful
      return result.type === actions.createCloudDocument.fulfilled.type;
    } catch (error) {
      console.error(`Error saving document ${documentId} to cloud:`, error);
      return false;
    }
  }

  useEffect(() => {
    // Apply filtering and sorting
    const filtered = filterDocuments(allDocuments, user, filterValue);
    const sorted = sortDocuments(filtered, sortValue.key, sortValue.direction);
    setFilteredDocuments(sorted);
  }, [allDocuments, user, filterValue, sortValue]);

  const handleCreateDocument = () => {
    const id = uuid();
    dispatch(
      actions.createLocalDocument({
        id,
        name: "Untitled Document",
        head: id,
        type: DocumentType.DOCUMENT,
        data: {
          root: {
            children: [],
            direction: null,
            format: "left",
            indent: 0,
            type: "root",
            version: 1,
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  };

  const handleCreateDirectory = () => {
    const id = uuid();
    dispatch(
      actions.createLocalDocument({
        id,
        name: "New Directory",
        head: id,
        type: DocumentType.DIRECTORY,
        data: {
          root: {
            children: [],
            direction: null,
            format: "left",
            indent: 0,
            type: "root",
            version: 1,
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  };

  // Backup function
  async function backup() {
    try {
      const documents = await documentDB.getAll();
      const revisions = await revisionDB.getAll();
      const data: BackupDocument[] = documents.map((document) => ({
        ...document,
        revisions: revisions.filter((revision) =>
          revision.documentId === document.id &&
          revision.id !== document.head
        ),
      }));

      const blob = new Blob([JSON.stringify(data)], {
        type: "text/json",
      });
      const link = window.document.createElement("a");

      const now = new Date();
      link.download = now.toISOString() + ".me";
      link.href = window.URL.createObjectURL(blob);
      link.dataset.downloadurl = ["text/json", link.download, link.href]
        .join(":");

      const evt = new MouseEvent("click", {
        view: window,
        bubbles: true,
        cancelable: true,
      });

      link.dispatchEvent(evt);
      link.remove();
    } catch (error) {
      dispatch(
        actions.announce({
          message: {
            title: "Backup failed",
            subtitle: "Please try again",
          },
        }),
      );
    }
  }

  const recentDocuments = filteredDocuments
    .filter((doc) => {
      const document = doc.local || doc.cloud;
      return document?.type === DocumentType.DOCUMENT;
    })
    .slice(0, 4);

  // Get orphaned documents and directories (those with null parentId and null domainId)
  const orphanedItems = filteredDocuments
    .filter((doc) => {
      const document = doc.local || doc.cloud;
      const parentId = document?.parentId;
      const domainId = document?.domainId;

      // Check if both parentId and domainId are null
      return parentId === null && domainId === null;
    })
    .slice(0, 8); // Limit to 8 items for display

  return (
    <DragProvider>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        {/* Welcome section */}
        <Paper
          elevation={0}
          sx={{
            p: 4,
            mb: 4,
            borderRadius: 2,
            background: "linear-gradient(to right, #f5f7fa, #e4e7eb)",
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Box sx={{ mb: { xs: 2, md: 0 } }}>
            <Typography variant="h4" component="h1" gutterBottom>
              Welcome
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ maxWidth: 600 }}
            >
              Create, edit, and share mathematical documents with ease. Our
              editor supports LaTeX, diagrams, and collaborative editing.
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 2 }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<Add />}
              onClick={handleCreateDocument}
            >
              New Document
            </Button>
            <Button
              variant="outlined"
              startIcon={<Add />}
              onClick={handleCreateDirectory}
            >
              New Directory
            </Button>
          </Box>
        </Paper>

        {/* Filter and sort controls */}
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            justifyContent: "space-between",
            alignItems: { xs: "stretch", sm: "center" },
            flexWrap: "wrap",
            mb: 4,
            gap: 2,
          }}
        >
          <Box
            sx={{
              width: "100%",
              maxWidth: { xs: "100%", sm: "85%", md: "90%", lg: "92%" },
              overflow: "hidden",
            }}
          >
            <FilterControl
              value={filterValue}
              setValue={setFilterValue}
              sx={{ maxWidth: "100%" }}
            />
          </Box>
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              gap: 2,
              minWidth: { xs: "100%", sm: "auto" },
            }}
          >
            <DocumentSortControl value={sortValue} setValue={setSortValue} />
            <ImportExportControl
              handleFilesChange={handleFilesChange}
              backupFunction={backup}
            />
          </Box>
        </Box>

        {/* Recent Documents section */}
        {recentDocuments.length > 0 && (
          <>
            <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
              Recent Documents
            </Typography>
            <Grid container spacing={3} sx={{ mb: 4 }}>
              {recentDocuments.map((document) => (
                <Grid
                  key={document.id}
                  size={{
                    xs: 12,
                    sm: 6,
                    md: 4,
                    lg: 3,
                  }}
                >
                  <DraggableDocumentCard
                    userDocument={document}
                    user={user}
                    currentDirectoryId=""
                  />
                </Grid>
              ))}
            </Grid>
          </>
        )}

        {/* Orphaned Items section */}
        {orphanedItems.length > 0 && (
          <>
            <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
              Orphaned Items
            </Typography>
            <Grid container spacing={3} sx={{ mb: 4 }}>
              {orphanedItems.map((document) => (
                <Grid
                  key={document.id}
                  size={{
                    xs: 12,
                    sm: 6,
                    md: 4,
                    lg: 3,
                  }}
                >
                  <DraggableDocumentCard
                    userDocument={document}
                    user={user}
                    currentDirectoryId=""
                  />
                </Grid>
              ))}
            </Grid>
          </>
        )}
      </Container>
      <TrashBin />
    </DragProvider>
  );
};

export default Home;
