"use client";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { type RootState, useSelector } from "@/store";
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
import { SidebarEmptyState } from "./SidebarEmptyState";
import {
  buildSeriesMap,
  groupRootItems,
  railItems,
} from "@/utils/posts/seriesGrouping";
import {
  ACTIVITY_RAIL_W,
  SIDEBAR_LAYER_TRANSITION,
  SIDEBAR_PANEL_ID,
} from "./constants";
import { COMPACT_WIDTH } from "./dragGeometry";

const SideBar: React.FC = () => {
  const pathname = usePathname();
  const can = capabilities(useSelector((state) => state.user));

  const {
    minOpenWidth,
    sidebarMode,
    dragZone,
    sidebarOpen: open,
    toggleSidebar,
    isMobile,
    widthTransition,
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

  // Flat list for the compact rail: notes first, then series (projects collapse
  // away) — the same order the expanded tree renders in.
  const flatGroups = useMemo(
    () => railItems(groupedRootItems),
    [groupedRootItems],
  );

  const hasContent = Boolean(user) &&
    (filteredDocuments.length > 0 || seriesMap.size > 0);

  return (
    <Drawer
      variant={isMobile ? "temporary" : "permanent"}
      open={open}
      onClose={toggleSidebar}
      // The pane the resize handle's `aria-controls` points at.
      PaperProps={{ id: SIDEBAR_PANEL_ID }}
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
          // A drag sets the width per frame and must not be transitioned; the
          // context has already resolved that against the two moments that do
          // ease, so this is one value rather than a condition per call site.
          transition: widthTransition,
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
            /* Full tree. Follows the *live* width, not the remembered one, so a
              1:1 drag widens the content with the panel instead of dragging the
              paper out from behind a pane frozen at the old width.

              Floored at the minimum open width — measured off these very labels
              — so that a drag heading for compact or hidden clips this pane off
              cleanly rather than squishing it below the point where its own
              labels truncate. */
          }
          <Box
            sx={paneSx(Math.max(getEffectiveWidth(), minOpenWidth))}
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
            {sidebarView === "search" && <SidebarHeader view={sidebarView} />}
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
              : (
                <SidebarEmptyState
                  onNewPost={() => postActions.handleCreatePost()}
                  onNewSeries={can.series
                    ? () => seriesActions.handleCreateSeries()
                    : undefined}
                />
              )}
          </Box>
        </Box>
      </Box>

      <SidebarContextMenu
        contextMenu={postMenu.contextMenu}
        onClose={postMenu.close}
        onEdit={postMenu.onEdit}
        onOpenToSide={postMenu.onOpenToSide}
        onRename={postMenu.onRename}
        onDelete={postMenu.onDelete}
      />

      <SidebarContextMenu
        contextMenu={seriesMenu.contextMenu}
        onClose={seriesMenu.close}
        onNewPost={seriesMenu.onNewPost}
        onEdit={seriesMenu.onEdit}
        onRename={seriesMenu.onRename}
        onDelete={seriesMenu.onDelete}
      />

      <SidebarContextMenu
        contextMenu={projectMenu.contextMenu}
        onClose={projectMenu.close}
        onNewSeries={projectMenu.onNewSeries}
        onRename={projectMenu.onRename}
        onDelete={projectMenu.onDelete}
      />
    </Drawer>
  );
};

export default SideBar;
