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
  SIDEBAR_LAYER_TRANSITION,
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
  const { sidebarFontSize } = useSidebarFontSize();
  const {
    postActions,
    seriesActions,
    projectActions,
    postMenu,
    seriesMenu,
    projectMenu,
  } = useSidebarActions();

  // Honor the OS "reduce motion" setting: drop the width slide and the push.
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // Rail and tree are laid out side by side in one horizontal track, rail first:
  //
  //   [ rail 62px ][ tree ≥130px ]
  //
  // Sliding the track left by exactly COMPACT_WIDTH swaps which one occupies the
  // panel — the tree travels 0 → -62px as the rail travels -62px → 0, so they
  // move together as a filmstrip rather than dissolving into each other. Both
  // stay fully opaque at every moment; the panel's own overflow does the hiding.
  //
  // A single transform on the track is what makes them move in lockstep. Two
  // independent translates would have to travel different distances (the tree is
  // wider than the rail) and would visibly drift apart mid-push.
  const trackShift = isExpanded ? -COMPACT_WIDTH : 0;
  // Each pane keeps its own fixed width so nothing reflows or squishes while the
  // container width animates underneath it.
  const paneSx = (paneWidth: number) => ({
    width: paneWidth,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column" as const,
    minHeight: 0,
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
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            transform: `translateX(${trackShift}px)`,
            transition: reducedMotion ? "none" : SIDEBAR_LAYER_TRANSITION,
            willChange: "transform",
          }}
        >
          {
            /* Compact rail — first in the track, so the panel shows it when the
              track sits at 0 and the tree has been pushed off to the right. */
          }
          <Box sx={paneSx(COMPACT_WIDTH)} inert={isExpanded || undefined}>
            <CollapsedRail
              groupedActivePosts={flatGroups}
              pathname={pathname}
            />
          </Box>

          {
            /* Full tree — pinned to at least the resting width so it clips
              cleanly (rather than squishing) while the paper animates/drags. */
          }
          <Box
            sx={paneSx(Math.max(width, SIDEBAR_MIN_WIDTH))}
            inert={!isExpanded || undefined}
          >
            {
              /* Workspace identity chip (Refined-Explorer header). Visual
              placeholder for now — switch behavior is wired later. */
            }
            <Box sx={{ px: 2, pt: 1.5, pb: 1, flexShrink: 0 }}>
              <WorkspaceSwitcher />
            </Box>
            {
              /* The view-title header is only needed for the search view now — in
              the explorer the tree's own "Notes"/"Projects" section headers label
              the content and carry the create ("+") affordances. */
            }
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
