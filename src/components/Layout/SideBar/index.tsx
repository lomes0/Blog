"use client";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { type RootState, useSelector } from "@/store";
import { selectUserFilteredDocuments } from "@/store/selectors/layoutSelectors";
import { Box, Drawer, useMediaQuery } from "@mui/material";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
import { useSidebarFontSize } from "./hooks/useSidebarFontSize";
import { useSidebarActions } from "./hooks/useSidebarActions";
import { SidebarHeader } from "./SidebarHeader";
import { ActivePostsSection } from "./ActivePostsSection";
import { SidebarSearchView } from "./SidebarSearchView";
import { PostContextMenu } from "./PostContextMenu";
import { SeriesContextMenu } from "./SeriesContextMenu";
import {
  buildSeriesMap,
  groupPostsBySeriesWithEmpty,
} from "@/utils/posts/seriesGrouping";
import {
  ACTIVITY_RAIL_W,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_TRANSITION,
} from "./constants";

const SideBar: React.FC = () => {
  const pathname = usePathname();

  const {
    width,
    sidebarOpen: open,
    toggleSidebar,
    isMobile,
    isResizing,
    startResize,
    getEffectiveWidth,
  } = useSidebarWidth();

  const { sidebarFontSize } = useSidebarFontSize();
  const sidebarActions = useSidebarActions();
  const {
    contextMenu,
    handleCloseContextMenu,
    handleEditPost,
    handleRenameFromMenu,
    handleDeletePost,
    seriesContextMenu,
    handleCloseSeriesContextMenu,
    handleEditSeries,
    handleRenameSeriesFromMenu,
    handleDeleteSeries,
  } = sidebarActions;

  // Honor the OS "reduce motion" setting: drop the width slide.
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  useKeyboardShortcuts({ onToggleSidebar: toggleSidebar, enabled: true });

  const user = useSelector((state: RootState) => state.user);
  const filteredDocuments = useSelector(selectUserFilteredDocuments);
  const seriesList = useSelector((state: RootState) => state.series);
  const sidebarView = useSelector((state: RootState) => state.ui.sidebarView);

  const seriesMap = useMemo(
    () => buildSeriesMap(seriesList || []),
    [seriesList],
  );

  const groupedActivePosts = useMemo(
    () => groupPostsBySeriesWithEmpty(filteredDocuments, seriesMap),
    [filteredDocuments, seriesMap],
  );

  const hasContent = Boolean(user) &&
    (filteredDocuments.length > 0 || seriesMap.size > 0);

  return (
    <Drawer
      variant={isMobile ? "temporary" : "permanent"}
      open={open}
      onClose={toggleSidebar}
      sx={{
        width: getEffectiveWidth(),
        flexShrink: 0,
        displayPrint: "none",
        "& .MuiDrawer-paper": {
          // Dock the fixed paper to the right of the activity rail, not the
          // viewport edge (mobile temporary drawer slides in past the rail too).
          left: `${ACTIVITY_RAIL_W}px`,
          width: getEffectiveWidth(),
          boxSizing: "border-box",
          transition: isResizing || reducedMotion
            ? "none"
            : SIDEBAR_WIDTH_TRANSITION,
          overflowX: "hidden",
          overscrollBehavior: "contain",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          fontSize: `${sidebarFontSize}px`,
          bgcolor: "background.sidebar",
        },
      }}
    >
      <Box
        sx={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}
      >
        {/* Content is pinned to at least the resting width so it clips cleanly
            (rather than squishing) while the paper animates/drags to 0. */}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            width: Math.max(width, SIDEBAR_MIN_WIDTH),
            display: "flex",
            flexDirection: "column",
          }}
        >
          <SidebarHeader view={sidebarView} />
          {sidebarView === "search"
            ? <SidebarSearchView pathname={pathname} />
            : hasContent
            ? (
              <ActivePostsSection
                groupedActivePosts={groupedActivePosts}
                sidebarOpen
                pathname={pathname}
                itemActions={sidebarActions}
                seriesActions={sidebarActions}
              />
            )
            : <Box sx={{ flex: "1 1 auto", minHeight: 0 }} />}
        </Box>
      </Box>

      {open && !isMobile && (
        <Box
          onMouseDown={startResize}
          sx={{
            position: "fixed",
            top: 0,
            left: ACTIVITY_RAIL_W + getEffectiveWidth() - 4,
            bottom: 0,
            width: 4,
            cursor: "col-resize",
            backgroundColor: isResizing ? "primary.main" : "transparent",
            transition: isResizing ? "none" : "background-color 0.2s",
            "&:hover": { backgroundColor: "primary.main", opacity: 0.5 },
            "&:active": { backgroundColor: "primary.main", opacity: 1 },
            zIndex: 1300,
          }}
        />
      )}

      <PostContextMenu
        contextMenu={contextMenu}
        onClose={handleCloseContextMenu}
        onEdit={handleEditPost}
        onRename={handleRenameFromMenu}
        onDelete={handleDeletePost}
      />

      <SeriesContextMenu
        contextMenu={seriesContextMenu}
        onClose={handleCloseSeriesContextMenu}
        onEdit={handleEditSeries}
        onRename={handleRenameSeriesFromMenu}
        onDelete={handleDeleteSeries}
      />
    </Drawer>
  );
};

export default SideBar;
