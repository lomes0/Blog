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
import { SidebarNav } from "./SidebarNav";
import { SidebarFooter } from "./SidebarFooter";
import { ActivePostsSection } from "./ActivePostsSection";
import { CollapsedRail } from "./CollapsedRail";
import { PostContextMenu } from "./PostContextMenu";
import {
  buildSeriesMap,
  groupPostsBySeriesWithEmpty,
} from "@/utils/posts/seriesGrouping";
import {
  COMPACT_WIDTH,
  LAYER_FADE_DURATION,
  SIDEBAR_EASING,
  SIDEBAR_WIDTH_TRANSITION,
} from "./constants";

const SideBar: React.FC = () => {
  const pathname = usePathname();

  const {
    width,
    sidebarMode,
    sidebarOpen: open,
    toggleSidebar,
    isMobile,
    isResizing,
    startResize,
    getEffectiveWidth,
  } = useSidebarWidth();

  const isExpanded = sidebarMode === "full";
  const { sidebarFontSize } = useSidebarFontSize();
  const {
    contextMenu,
    handleCloseContextMenu,
    handleEditPost,
    handleRenameFromMenu,
    handleDeletePost,
    ...postItemActions
  } = useSidebarActions();

  // Honor the OS "reduce motion" setting: drop the width slide and cross-fade.
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  useKeyboardShortcuts({ onToggleSidebar: toggleSidebar, enabled: true });

  const user = useSelector((state: RootState) => state.user);
  const filteredDocuments = useSelector(selectUserFilteredDocuments);
  const seriesList = useSelector((state: RootState) => state.series);

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

  const fade = reducedMotion ? 0 : LAYER_FADE_DURATION;

  // Open and rail contents are stacked as two absolutely-positioned, fixed-width
  // layers that cross-fade. The outgoing layer keeps its own width so nothing
  // reflows/squishes while the container width animates; the hidden layer is
  // inert (opacity 0 + pointer-events none) and the narrower container clips it.
  const layerSx = (layerWidth: number, visible: boolean) => ({
    position: "absolute" as const,
    top: 0,
    left: 0,
    bottom: 0,
    width: layerWidth,
    display: "flex",
    flexDirection: "column" as const,
    opacity: visible ? 1 : 0,
    pointerEvents: visible ? ("auto" as const) : ("none" as const),
    transition: `opacity ${fade}s ${SIDEBAR_EASING}`,
  });

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
      <Box sx={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Open (expanded) layer — pinned to the user's preferred width. */}
        <Box className="sb-layer-open" sx={layerSx(width, isExpanded)}>
          <SidebarHeader open />
          <SidebarNav expanded pathname={pathname} />
          {hasContent
            ? (
              <ActivePostsSection
                groupedActivePosts={groupedActivePosts}
                sidebarOpen
                pathname={pathname}
                itemActions={postItemActions}
              />
            )
            : <Box sx={{ flex: "1 1 auto", minHeight: 0 }} />}
          <SidebarFooter expanded />
        </Box>

        {/* Collapsed rail layer — fixed at the compact width. */}
        <Box className="sb-layer-rail" sx={layerSx(COMPACT_WIDTH, !isExpanded)}>
          <SidebarHeader open={false} />
          <SidebarNav expanded={false} pathname={pathname} />
          <CollapsedRail
            groupedActivePosts={groupedActivePosts}
            pathname={pathname}
          />
          <SidebarFooter expanded={false} />
        </Box>
      </Box>

      {isExpanded && !isMobile && (
        <Box
          onMouseDown={startResize}
          sx={{
            position: "fixed",
            top: 0,
            left: getEffectiveWidth() - 4,
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
    </Drawer>
  );
};

export default SideBar;
