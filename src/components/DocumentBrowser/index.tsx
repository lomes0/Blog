"use client";
import { useSelector } from "@/store";
import { useMemo, useState } from "react";
import { Box, Container, Fade } from "@mui/material";
import { UserDocument } from "@/types";
import { sortDocuments } from "../DocumentControls/sortDocuments";
import DocumentGrid from "../DocumentGrid";
import { DragProvider } from "../DragContext";
import TrashBin from "../TrashBin";
import { DocumentURLProvider } from "../DocumentURLContext";

// Import custom hooks and components
import { useDocumentFiltering } from "./hooks/useDocumentFiltering";
import { useBreadcrumbs } from "./hooks/useBreadcrumbs";
import { useDocumentNavigation } from "./hooks/useDocumentNavigation";
import BrowserBreadcrumbs from "./components/BrowserBreadcrumbs";
import BrowserHeader from "./components/BrowserHeader";
import EmptyState from "./components/EmptyState";
import LoadingState from "./components/LoadingState";
import ErrorState from "./components/ErrorState";

interface DocumentBrowserProps {
  directoryId?: string; // Keep for compatibility but unused in blog structure
  domainId?: string; // Keep for compatibility but unused in blog structure
  domainInfo?: any; // Keep for compatibility but unused in blog structure
}

const DocumentBrowser: React.FC<DocumentBrowserProps> = ({
  directoryId,
  domainId,
  domainInfo,
}) => {
  const documents = useSelector((state) => state.documents);
  const user = useSelector((state) => state.user);

  // State for loading and sorting
  const [loading] = useState(false); // Remove loading state since we're using synchronous filtering
  const [sortValue, setSortValue] = useState({
    key: "updatedAt",
    direction: "desc",
  });

  // Use custom hooks for complex logic
  const { directories, regularDocuments, currentDirectory } =
    useDocumentFiltering({
      documents,
      directoryId,
      domainId,
    });

  const breadcrumbs = useBreadcrumbs(directoryId, documents);
  const { createDocument, createDirectory } = useDocumentNavigation({
    directoryId,
    domainId,
    domainInfo,
  });

  // Function to get the correct URL for a blog post
  const getDocumentUrl = useMemo(() => {
    return (doc: UserDocument) => {
      const docId = doc.id;
      // In blog structure, all posts use the same URL pattern
      return `/view/${docId}`;
    };
  }, []);

  // Apply sorting to the filtered results
  const sortedDirectories = useMemo(
    () => sortDocuments(directories, sortValue.key, sortValue.direction),
    [directories, sortValue.key, sortValue.direction],
  );

  const sortedDocuments = useMemo(
    () => sortDocuments(regularDocuments, sortValue.key, sortValue.direction),
    [regularDocuments, sortValue.key, sortValue.direction],
  );

  // Early returns for various states
  if (loading) {
    return <LoadingState />;
  }

  // In blog structure, we don't expect directory navigation errors
  // Remove the directory not found check

  const hasNoItems = regularDocuments.length === 0; // No directories in blog structure

  return (
    <DragProvider>
      <DocumentURLProvider getDocumentUrl={getDocumentUrl}>
        <Container
          maxWidth={false}
          sx={{
            py: 4,
            px: { xs: 2, sm: 3, md: 4, lg: 1 },
            maxWidth: { xs: "100%", sm: "100%", md: "2000px", lg: "2200px" },
            mx: "auto",
          }}
        >
          <Fade in={true} timeout={600}>
            <Box
              className="document-browser-container"
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                width: "100%",
                maxWidth: "100%",
                px: {
                  xs: 1,
                  sm: 2,
                  md: 3,
                  lg: 3,
                },
              }}
            >
              {/* Page title and controls */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: { xs: "wrap", md: "nowrap" },
                  gap: 2,
                  pb: 2,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <BrowserBreadcrumbs
                    breadcrumbs={breadcrumbs}
                    domainInfo={domainInfo}
                    directoryId={directoryId}
                  />
                </Box>

                <BrowserHeader
                  onCreateDocument={createDocument}
                  onCreateDirectory={createDirectory}
                  sortValue={sortValue}
                  setSortValue={setSortValue}
                  domainInfo={domainInfo}
                />
              </Box>

              {/* Content section */}
              {hasNoItems
                ? (
                  <EmptyState
                    directoryId={directoryId}
                    domainInfo={domainInfo}
                    onCreateDocument={createDocument}
                    onCreateDirectory={createDirectory}
                  />
                )
                : (
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      opacity: 1,
                      transition: "opacity 0.5s ease-in-out",
                    }}
                  >
                    {/* Display blog posts section */}
                    {sortedDocuments.length > 0 && (
                      <DocumentGrid
                        items={sortedDocuments}
                        user={user}
                        currentDirectoryId={directoryId}
                        title="Posts"
                      />
                    )}
                  </Box>
                )}
            </Box>
          </Fade>
        </Container>
      </DocumentURLProvider>
      <TrashBin />
    </DragProvider>
  );
};

export default DocumentBrowser;
