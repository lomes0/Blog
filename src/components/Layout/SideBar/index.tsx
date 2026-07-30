"use client";
import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { actions, type RootState, useDispatch, useSelector } from "@/store";
import { capabilities } from "@/lib/capabilities";
import { selectRootPosts } from "@/store/selectors/layoutSelectors";
import { Box, Drawer, useMediaQuery } from "@mui/material";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
import { useSidebarFontSize } from "./hooks/useSidebarFontSize";
import { useSidebarActions } from "./hooks/useSidebarActions";
import { SidebarHeader } from "./SidebarHeader";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { ActivePostsSection } from "./ActivePostsSection";
import { SidebarSearchView } from "./SidebarSearchView";
import { CollapsedRail } from "./CollapsedRail";
import { SidebarContextMenu } from "./SidebarContextMenu";
import CreateSeriesDrawer from "@/components/drawers/CreateSeriesDrawer";
import {
  buildSeriesMap,
  flattenRootItems,
  groupRootItems,
} from "@/utils/posts/seriesGrouping";
import {
  ACTIVITY_RAIL_W,
  COMPACT_WIDTH,
  LAYER_FADE_DURATION,
  SIDEBAR_EASING,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_TRANSITION,
} from "./constants";

const SideBar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useDispatch();
  const can = capabilities(useSelector((state) => state.user));

  // Create actions live in the header (IDE-style). New Post reuses the shared
  // `/new` editor route; New Series opens the same drawer the posts page uses.
  const [seriesDrawerOpen, setSeriesDrawerOpen] = useState(false);
  const handleNewPost = useCallback(() => router.push("/new"), [router]);
  const handleNewSeries = useCallback(() => setSeriesDrawerOpen(true), []);
  const handleSeriesCreated = useCallback(() => {
    // Refresh the Redux series list so the new series appears in the tree.
    dispatch(actions.loadSeries());
  }, [dispatch]);

  const {
    width,
    sidebarMode,
    dragZone,
    panelOpacity,
    sidebarOpen: open,
    toggleSidebar,
    isMobile,
    isResizing,
    isAnimating,
    getEffectiveWidth,
  } = useSidebarWidth();

  // While dragging, render the mode the release would land in rather than the
  // committed one: the drag is WYSIWYG, so the compact rail is already on screen
  // by the time you let go of it.
  const shownMode = dragZone ?? sidebarMode;
  const isExpanded = shownMode === "full";
  // The hidden zone keeps showing the compact rail and fades the whole surface
  // out instead — an emptied panel mid-drag reads as a glitch, a dimming one
  // reads as "let go and it's gone".
  const showCompactRail = shownMode === "compact" || shownMode === "hidden";
  const { sidebarFontSize } = useSidebarFontSize();
  const {
    postActions,
    seriesActions,
    projectActions,
    postMenu,
    seriesMenu,
    projectMenu,
  } = useSidebarActions();

  // Honor the OS "reduce motion" setting: drop the width slide and cross-fade.
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const fade = reducedMotion ? 0 : LAYER_FADE_DURATION;

  // Full and compact contents are stacked as two absolutely-positioned,
  // fixed-width layers that cross-fade. The outgoing layer keeps its own width
  // so nothing reflows/squishes while the container width animates; the hidden
  // layer is inert (opacity 0 + pointer-events none) and clipped by the
  // narrower container.
  const layerSx = (layerWidth: number, visible: boolean) => ({
    position: "absolute" as const,
    inset: 0,
    width: layerWidth,
    display: "flex",
    flexDirection: "column" as const,
    opacity: visible ? 1 : 0,
    pointerEvents: visible ? ("auto" as const) : ("none" as const),
    transition: `opacity ${fade}s ${SIDEBAR_EASING}`,
  });

  useKeyboardShortcuts({ onToggleSidebar: toggleSidebar, enabled: true });

  const user = useSelector((state: RootState) => state.user);
  const filteredDocuments = useSelector(selectRootPosts);
  const seriesList = useSelector((state: RootState) => state.series);
  const projectsList = useSelector((state: RootState) => state.projects);
  const sidebarView = useSelector((state: RootState) => state.ui.sidebarView);

  const seriesMap = useMemo(
    () => buildSeriesMap(seriesList || []),
    [seriesList],
  );

  // Nested root tree: projects wrapping their series, interleaved with ungrouped
  // series and standalone posts by rank.
  const groupedRootItems = useMemo(
    () => groupRootItems(filteredDocuments, seriesMap, projectsList || []),
    [filteredDocuments, seriesMap, projectsList],
  );

  // Flat series/standalone list for the compact rail (projects collapse away).
  const flatGroups = useMemo(
    () => flattenRootItems(groupedRootItems),
    [groupedRootItems],
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
          // The drag and its settle spring both set the width per frame; a CSS
          // transition on top would lag behind and fight the spring.
          transition: isResizing || isAnimating || reducedMotion
            ? "none"
            : SIDEBAR_WIDTH_TRANSITION,
          opacity: panelOpacity,
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
        {/* Full layer — pinned to at least the resting width so it clips
            cleanly (rather than squishing) while the paper animates/drags. */}
        <Box sx={layerSx(Math.max(width, SIDEBAR_MIN_WIDTH), isExpanded)}>
          {/* Workspace identity chip (Refined-Explorer header). Visual
              placeholder for now — switch behavior is wired later. */}
          <Box sx={{ px: 2, pt: 1.5, pb: 1, flexShrink: 0 }}>
            <WorkspaceSwitcher />
          </Box>
          {/* The view-title header is only needed for the search view now — in
              the explorer the tree's own "Notes"/"Projects" section headers label
              the content and carry the create ("+") affordances. */}
          {sidebarView === "search" && (
            <SidebarHeader
              view={sidebarView}
              onNewPost={handleNewPost}
              onNewSeries={can.series ? handleNewSeries : undefined}
            />
          )}
          {sidebarView === "search"
            ? <SidebarSearchView pathname={pathname} />
            : hasContent
            ? (
              <ActivePostsSection
                rootItems={groupedRootItems}
                sidebarOpen
                pathname={pathname}
                itemActions={postActions}
                seriesActions={seriesActions}
                projectActions={projectActions}
              />
            )
            : <Box sx={{ flex: "1 1 auto", minHeight: 0 }} />}
        </Box>

        {/* Compact layer — fixed icon strip shown when dragged shut. */}
        <Box sx={layerSx(COMPACT_WIDTH, showCompactRail)}>
          <CollapsedRail
            groupedActivePosts={flatGroups}
            pathname={pathname}
          />
        </Box>
      </Box>

      <SidebarContextMenu
        contextMenu={postMenu.contextMenu}
        onClose={postMenu.close}
        onEdit={postMenu.onEdit}
        onRename={postMenu.onRename}
        onDelete={postMenu.onDelete}
      />

      <SidebarContextMenu
        contextMenu={seriesMenu.contextMenu}
        onClose={seriesMenu.close}
        onEdit={seriesMenu.onEdit}
        onRename={seriesMenu.onRename}
        onDelete={seriesMenu.onDelete}
      />

      <SidebarContextMenu
        contextMenu={projectMenu.contextMenu}
        onClose={projectMenu.close}
        onRename={projectMenu.onRename}
        onDelete={projectMenu.onDelete}
      />

      <CreateSeriesDrawer
        open={seriesDrawerOpen}
        onClose={() => setSeriesDrawerOpen(false)}
        onSuccess={handleSeriesCreated}
      />
    </Drawer>
  );
};

export default SideBar;
