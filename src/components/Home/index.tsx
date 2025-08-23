"use client";
import { useEffect, useState } from "react";
import { Box, Button, Card, Container, Paper, Typography } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { Add, FilterList, Folder } from "@mui/icons-material";
import { UserDocument } from "@/types";
import { actions, useDispatch, useSelector } from "@/store";
import DraggableDocumentCard from "../DocumentCard/DraggableDocumentCard";
import FilterControl from "../DocumentControls/FilterControl";
import DocumentSortControl from "../DocumentControls/SortControl";
import ImportExportControl from "../DocumentControls/ImportExportControl";
import { sortDocuments } from "../DocumentControls/sortDocuments";
import { filterDocuments } from "../DocumentControls/FilterControl";
import { v4 as uuid } from "uuid";
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

  // Handle creating a new post
  const handleCreateDocument = () => {
    const id = uuid();
    dispatch(
      actions.createLocalDocument({
        id,
        name: "New Post",
        head: id,
        type: "DOCUMENT",
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
      }),
    );
  };

  // Get recent posts (documents that are posts)
  const recentPosts = filteredDocuments
    .filter((doc) => {
      const document = doc.local || doc.cloud;
      return document?.type === "DOCUMENT";
    })
    .slice(0, 4);

  // Update filtered documents when documents, filter, or sort change
  useEffect(() => {
    const filtered = filterDocuments(allDocuments, user, filterValue);
    const sorted = sortDocuments(filtered, sortValue.key, sortValue.direction);
    setFilteredDocuments(sorted);
  }, [allDocuments, user, filterValue, sortValue]);

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
              Welcome to Our Blog
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ maxWidth: 600 }}
            >
              Discover and share knowledge through engaging posts and series.
              Create rich content with LaTeX, diagrams, and collaborative
              editing.
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 2 }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<Add />}
              onClick={handleCreateDocument}
            >
              New Post
            </Button>
            <Button
              variant="outlined"
              startIcon={<Folder />}
              onClick={() => window.location.href = "/series/new"}
            >
              New Series
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
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <FilterList fontSize="small" />
            <FilterControl
              value={filterValue}
              setValue={setFilterValue}
            />
          </Box>
          <Box sx={{ display: "flex", gap: 2 }}>
            <DocumentSortControl
              value={sortValue}
              setValue={setSortValue}
            />
            <ImportExportControl />
          </Box>
        </Box>

        {/* Recent Posts Section */}
        <Typography variant="h5" component="h2" gutterBottom sx={{ mb: 3 }}>
          Recent Posts
        </Typography>

        {recentPosts.length > 0
          ? (
            <Grid container spacing={3} sx={{ mb: 4 }}>
              {recentPosts.map((doc) => (
                <Grid key={doc.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <DraggableDocumentCard userDocument={doc} user={user} />
                </Grid>
              ))}
            </Grid>
          )
          : (
            <Card sx={{ p: 4, textAlign: "center", mb: 4 }}>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No posts yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Start by creating your first blog post!
              </Typography>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={handleCreateDocument}
              >
                Create First Post
              </Button>
            </Card>
          )}

        {/* All Posts Section */}
        <Typography variant="h5" component="h2" gutterBottom sx={{ mb: 3 }}>
          All Posts ({filteredDocuments.length})
        </Typography>

        <Grid container spacing={3}>
          {filteredDocuments.map((doc) => (
            <Grid key={doc.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <DraggableDocumentCard userDocument={doc} user={user} />
            </Grid>
          ))}
        </Grid>

        {/* Trash Bin for drag and drop */}
        <TrashBin />
      </Container>
    </DragProvider>
  );
};

export default Home;
