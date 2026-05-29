"use client";
import { Box, Typography } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { useRouter } from "next/navigation";
import { Series, User, UserDocument } from "@/types";
import { DragProvider } from "@/contexts/DragContext";
import TrashBin from "./TrashBin";
import { useCallback, useState } from "react";
import { useDocuments } from "@/hooks/useDocuments";
import useLocalStorage from "@/hooks/useLocalStorage";
import KanbanPreviewCard from "./KanbanPreviewCard";
import ReadmePreviewCard from "./ReadmePreviewCard";
import RecentPostsPreviewCard from "./RecentPostsPreviewCard";
import FullViewDialog from "./FullViewDialog";
import NotesCanvas from "../NotesCanvas";
import KanbanBoard from "./KanbanBoard";
import ReadmeViewer from "./ReadmeViewer";
import { CardErrorBoundary } from "@/components/ErrorBoundary";
import { StickyNote } from "lucide-react";
import { useNotesBoards } from "@/hooks/useNotesBoards";
import { useNotesZoom } from "@/hooks/useNotesZoom";
import BoardSelector from "../NotesCanvas/BoardSelector";
import ZoomControls from "../NotesCanvas/ZoomControls";
import { NotesClipboardProvider } from "@/contexts/NotesClipboardContext";

type ViewType = "notes" | "kanban" | "readme" | "posts" | null;

const Home: React.FC<{
  staticDocuments: UserDocument[];
  series?: Series[];
  user?: User;
}> = ({ staticDocuments }) => {
  const router = useRouter();
  const [activeView, setActiveView] = useState<ViewType>(null);
  const {
    boards,
    activeCanvasId,
    setActiveCanvasId,
    createBoard,
    renameBoard,
    deleteBoard,
  } = useNotesBoards();
  const zoom = useNotesZoom(activeCanvasId);
  const [notesHeight, setNotesHeight] = useLocalStorage(
    "notesCanvasHeight",
    400,
  );
  const [isResizing, setIsResizing] = useState(false);
  const { documents, refresh } = useDocuments(staticDocuments);

  const recentPosts = documents.slice(0, 8);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = notesHeight;

      setIsResizing(true);

      const handleResizeMove = (moveEvent: MouseEvent) => {
        const deltaY = moveEvent.clientY - startY;
        const newHeight = Math.max(200, startHeight + deltaY);
        setNotesHeight(newHeight);
      };

      const handleResizeEnd = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleResizeMove);
        document.removeEventListener("mouseup", handleResizeEnd);
      };

      document.addEventListener("mousemove", handleResizeMove);
      document.addEventListener("mouseup", handleResizeEnd);
    },
    [notesHeight, setNotesHeight],
  );

  const handleOpenView = (viewType: ViewType) => {
    setActiveView(viewType);
  };

  const handleCloseView = () => {
    setActiveView(null);
  };

  return (
    <DragProvider>
      <Box sx={{ py: 2, px: { xs: 1, sm: 2, md: 3 }, width: "100%" }}>
        <Grid container spacing={2}>
          {/* Notes Canvas - Full width at top */}
          <Grid size={{ xs: 12 }}>
            <NotesClipboardProvider>
              <CardErrorBoundary title="Notes">
                {/* Board selector + canvas in unified container */}
                <Box
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    overflow: "hidden",
                    bgcolor: "background.paper",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      px: 1.5,
                      py: 0.75,
                    }}
                  >
                    <StickyNote
                      size={18}
                      style={{ color: "var(--mui-palette-text-secondary)", flexShrink: 0 }}
                    />
                    <BoardSelector
                      boards={boards}
                      activeCanvasId={activeCanvasId}
                      onSelectBoard={setActiveCanvasId}
                      onCreateBoard={createBoard}
                      onRenameBoard={renameBoard}
                      onDeleteBoard={deleteBoard}
                    />
                    <ZoomControls zoom={zoom} />
                  </Box>
                  <Box
                    sx={{
                      height: `${notesHeight}px`,
                      minHeight: 200,
                      overflow: "hidden",
                      position: "relative",
                      // Remove NotesCanvas own border since the parent provides it
                      "& > *:first-of-type": {
                        border: "none",
                        borderRadius: 0,
                      },
                    }}
                  >
                    <NotesCanvas
                      canvasId={activeCanvasId}
                      scale={zoom.scale}
                      onZoomIn={zoom.zoomIn}
                      onZoomOut={zoom.zoomOut}
                      onResetZoom={zoom.resetZoom}
                    />

                    {/* Resize Handle */}
                    <Box
                      onMouseDown={handleResizeStart}
                      sx={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 8,
                        cursor: "ns-resize",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isResizing
                          ? "action.selected"
                          : "transparent",
                        "&:hover": {
                          backgroundColor: "action.hover",
                        },
                        transition: "background-color 0.2s",
                        zIndex: 10,
                      }}
                    />
                  </Box>
                </Box>
              </CardErrorBoundary>
            </NotesClipboardProvider>
          </Grid>
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <CardErrorBoundary title="Board">
              <KanbanPreviewCard
                documents={documents}
                onViewFull={() => handleOpenView("kanban")}
              />
            </CardErrorBoundary>
          </Grid>

          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <CardErrorBoundary title="README">
              <ReadmePreviewCard
                documents={documents}
                onViewFull={() => handleOpenView("readme")}
              />
            </CardErrorBoundary>
          </Grid>

          <Grid size={{ xs: 12, md: 12, lg: 4 }}>
            <CardErrorBoundary title="Recent Posts">
              <RecentPostsPreviewCard
                documents={recentPosts}
                onViewFull={() => router.push("/posts")}
              />
            </CardErrorBoundary>
          </Grid>
        </Grid>

        {/* Empty State */}
        {documents.length === 0 && (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography variant="body1" color="text.secondary">
              No posts yet
            </Typography>
          </Box>
        )}

        <TrashBin />

        {/* Full View Dialog */}
        <FullViewDialog
          open={activeView !== null}
          onClose={handleCloseView}
          viewType={activeView}
        >
          {activeView === "kanban" && (
            <KanbanBoard documents={documents} onRefresh={refresh} />
          )}
          {activeView === "readme" && <ReadmeViewer documents={documents} />}
        </FullViewDialog>
      </Box>
    </DragProvider>
  );
};

export default Home;
