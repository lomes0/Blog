"use client";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { type RootState, useSelector } from "@/store";
import { capabilities } from "@/lib/capabilities";
import {
  selectRootOrder,
  selectRootPosts,
} from "@/store/selectors/layoutSelectors";
import { Box, Drawer } from "@mui/material";
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
    sidebarOpen: open,
    toggleSidebar,
    isMobile,
    widthTransition,
    noWidthMotion,
    sidebarWidth,
  } = useSidebarWidth();

  // The committed mode, throughout — including during a drag. A drag previews
  // its destination beside the panel rather than inside it, so swapping the
  // rail in here mid-gesture would put a 76px pane in a panel still 300px wide:
  // the preview says where the panel is going, and this says where it is.
  const isExpanded = sidebarMode === "full";
  const { sidebarFontSize } = useSidebarFontSize();
  const {
    postActions,
    seriesActions,
    projectActions,
    postMenu,
    seriesMenu,
    projectMenu,
  } = useSidebarActions();

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
  const rootOrder = useSelector(selectRootOrder);

  const seriesMap = useMemo(
    () => buildSeriesMap(seriesList || []),
    [seriesList],
  );

  // Nested root tree: projects wrapping their series, interleaved with ungrouped
  // series and standalone posts in the author's `rootOrder`
  // (docs/plans/ordering-simplification.md §2).
  const groupedRootItems = useMemo(
    () =>
      groupRootItems(filteredDocuments, seriesMap, projectsList || [], rootOrder),
    [filteredDocuments, seriesMap, projectsList, rootOrder],
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
        width: sidebarWidth,
        flexShrink: 0,
        displayPrint: "none",
        "& .MuiDrawer-paper": {
          // Dock the fixed paper to the right of the activity rail, not the
          // viewport edge (mobile temporary drawer slides in past the rail too).
          left: `${ACTIVITY_RAIL_W}px`,
          width: sidebarWidth,
          boxSizing: "border-box",
          // Instant after a drag release, a slide after a programmatic mode
          // change. The context has already resolved which, so this is one
          // value rather than a condition per call site.
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
            // The same rule the panel's own width follows, and for the same
            // reason: the push and the width change are one event. A drag
            // release snaps both — sliding the panes over a width that already
            // jumped would leave the tree visibly clipped inside a 76px panel
            // for the length of the push. `noWidthMotion` folds in
            // `prefers-reduced-motion`, which drops the push on principle.
            transition: noWidthMotion ? "none" : SIDEBAR_LAYER_TRANSITION,
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
            /* Full tree, sized to the panel so the content fills it rather than
              being dragged out from behind a pane frozen at some other width.

              Floored at the minimum open width — measured off these very labels
              — so that a collapse to compact or hidden clips this pane off
              cleanly rather than squishing it below the point where its own
              labels truncate. */
          }
          <Box
            sx={paneSx(Math.max(sidebarWidth, minOpenWidth))}
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
              ? <SidebarSearchView />
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
