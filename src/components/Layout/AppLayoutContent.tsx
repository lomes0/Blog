"use client";
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { LexicalEditor } from "lexical";
import SideBar from "./SideBar";
import ActivityRail from "./ActivityRail";
import SidebarResizeHandle from "./SideBar/SidebarResizeHandle";
import { ACTIVITY_RAIL_W } from "./SideBar/constants";
import { CONTENT_PAD_X } from "./contentInset";
import { COLLAPSE_EASING } from "./SideBar/dragGeometry";
import HydrationManager from "./HydrationManager";
import EditorTopBar from "./EditorTopBar";
import RightRail from "./RightRail";
import CopilotPanel from "@/components/CopilotPanel/CopilotPanel";
import InlineCopilotBar, {
  hasInlineCopilotBar,
  INLINE_BAR_CLEARANCE,
} from "@/components/CopilotPanel/InlineCopilotBar";
import CommandPalette from "@/components/CommandPalette/CommandPalette";
import { Box, Container } from "@mui/material";
import { actions, type RootState, useDispatch, useSelector } from "@/store";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
import { useLayoutMode } from "@/contexts/LayoutModeContext";
import { usePathname } from "next/navigation";
import { RAIL_COMPACT_W } from "@/contexts/LayoutModeContext";
import {
  ActiveEditorContext,
  SetActiveEditorContext,
} from "@/contexts/ActiveEditorContext";
import { TopBarTabsProvider } from "@/contexts/TopBarTabsContext";
import { useToolbarSlot } from "@/contexts/ToolbarSlotContext";

// Must match the grid-template-columns transition duration below.
const COPILOT_TRANSITION_MS = 225;

const AppLayoutContent = ({ children }: { children: React.ReactNode }) => {
  const { setSlotEl } = useToolbarSlot();
  const dispatch = useDispatch();
  const initialized = useSelector((state: RootState) => state.ui.initialized);
  const { isResizing, easeMs, getEffectiveWidth } = useSidebarWidth();
  const {
    railMode,
    railWidth,
    isRailResizing,
    copilotOpen,
    copilotWidth,
    isCopilotResizing,
  } = useLayoutMode();
  const activeTabId = useSelector(
    (state: RootState) => state.ui.tabs.activeTabId,
  );
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const routeMode = segments[0] === "edit"
    ? "edit"
    : segments[0] === "view"
    ? "view"
    : null;
  const routeDocId = routeMode ? (segments[1] ?? null) : null;
  // A view route is authoritative; the active tab may be stale from a prior
  // edit session. Edit mode still follows the selected tab. `null` on every
  // other route — the Copilot then talks about the library rather than a
  // document, which is what the home pane's composer opens it for.
  const copilotDocumentId = routeMode === "view"
    ? routeDocId
    : routeMode === "edit"
    ? activeTabId ?? routeDocId
    : null;

  const [activeEditorRef, setActiveEditorRef] = useState<
    RefObject<LexicalEditor | null>
  >(() => ({ current: null }));

  // Keep the panel mounted through the close animation so it clips gradually as
  // the grid column shrinks, instead of vanishing instantly (mirrors RightRail).
  const [showCopilot, setShowCopilot] = useState(copilotOpen);
  useEffect(() => {
    if (copilotOpen) {
      setShowCopilot(true);
    } else {
      const t = setTimeout(() => setShowCopilot(false), COPILOT_TRANSITION_MS);
      return () => clearTimeout(t);
    }
  }, [copilotOpen]);

  useEffect(() => {
    if (!initialized) dispatch(actions.load());
  }, [dispatch, initialized]);

  const sidebarW = getEffectiveWidth();
  const railW = railMode === "full"
    ? railWidth + RAIL_COMPACT_W
    : RAIL_COMPACT_W;

  // Always keep the column present (0px when closed) so its width can animate
  // open/closed instead of the track appearing/disappearing.
  const copilotCol = `${copilotOpen ? copilotWidth : 0}px `;

  return (
    <TopBarTabsProvider>
      <SetActiveEditorContext.Provider value={setActiveEditorRef}>
        <ActiveEditorContext.Provider value={activeEditorRef}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns:
                `${ACTIVITY_RAIL_W}px ${sidebarW}px 1fr ${copilotCol}${railW}px`,
              height: "100vh",
              overflow: "hidden",
              // The sidebar drag drives its column width per frame, so the grid
              // must not also transition it — except across the one step that
              // eases, where the content edge has to travel with the panel or
              // the two visibly come apart.
              transition: easeMs > 0
                ? `grid-template-columns ${easeMs}ms ${COLLAPSE_EASING}`
                : isResizing || isRailResizing || isCopilotResizing
                ? "none"
                : "grid-template-columns 225ms cubic-bezier(0.4, 0, 0.6, 1)",
            }}
          >
            <ActivityRail />
            <SideBar />
            <Box
              id="app-main"
              component="main"
              sx={{
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <Box id="back-to-top-anchor" />
              <EditorTopBar />
              <Box ref={setSlotEl} sx={{ flexShrink: 0 }} />
              <HydrationManager>
                <Container
                  className="editor-container"
                  id="editor-main-container"
                  maxWidth={false}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    mx: 0,
                    my: 2,
                    flex: 1,
                    minHeight: 0,
                    position: "relative",
                    overflow: "auto",
                    width: "100%",
                    pl: {
                      xs: CONTENT_PAD_X.xs.left,
                      sm: CONTENT_PAD_X.sm.left,
                      md: CONTENT_PAD_X.md.left,
                    },
                    pr: {
                      xs: CONTENT_PAD_X.xs.right,
                      sm: CONTENT_PAD_X.sm.right,
                      md: CONTENT_PAD_X.md.right,
                    },
                    // Room to scroll the end of a document out from under the
                    // resting Copilot bar.
                    pb: hasInlineCopilotBar(pathname)
                      ? `${INLINE_BAR_CLEARANCE}px`
                      : 0,
                  }}
                >
                  {children}
                </Container>
              </HydrationManager>
              {
                /* A sibling of the scrolling container, not a child of it: the
                  bar is anchored to the foot of the pane and must not scroll
                  away with the document it is asking about. `#app-main` is the
                  positioned ancestor it hangs from. */
              }
              <InlineCopilotBar documentId={copilotDocumentId} />
            </Box>
            {
              /* Always keep a grid item in the copilot slot so the rail stays
                pinned in the last column. When the panel is closed the slot is
                an empty placeholder; the column itself animates to 0px. */
            }
            {showCopilot
              ? <CopilotPanel documentId={copilotDocumentId} />
              : <Box />}
            <RightRail railMode={railMode} />
          </Box>
          {
            /* Outside the grid on purpose: it is `position: fixed` and owns its
              own offset, and a child of the grid container — even an
              out-of-flow one — invites miscounting the five tracks above. */
          }
          <SidebarResizeHandle />
          <CommandPalette />
        </ActiveEditorContext.Provider>
      </SetActiveEditorContext.Provider>
    </TopBarTabsProvider>
  );
};

export default AppLayoutContent;
