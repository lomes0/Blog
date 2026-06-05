"use client";
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { LexicalEditor } from "lexical";
import SideBar from "./SideBar";
import HydrationManager from "./HydrationManager";
import EditorTopBar from "./EditorTopBar";
import RightRail from "./RightRail";
import CopilotPanel from "@/components/CopilotPanel/CopilotPanel";
import { Box, Container } from "@mui/material";
import { actions, type RootState, useDispatch, useSelector } from "@/store";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
import { useLayoutMode } from "@/contexts/LayoutModeContext";
import { usePathname } from "next/navigation";
import { COMPACT_WIDTH } from "@/components/Layout/SideBar/constants";
import { RAIL_COMPACT_W } from "@/contexts/LayoutModeContext";
import {
  ActiveEditorContext,
  SetActiveEditorContext,
} from "@/contexts/ActiveEditorContext";
import FloatingOutlinePill from "./FloatingOutlinePill";
import { TopBarTabsProvider } from "@/contexts/TopBarTabsContext";

const COPILOT_W = 380;

const AppLayoutContent = ({ children }: { children: React.ReactNode }) => {
  const dispatch = useDispatch();
  const initialized = useSelector((state: RootState) => state.ui.initialized);
  const { isResizing, getEffectiveWidth } = useSidebarWidth();
  const { railMode, railWidth, isRailResizing, viewMode } = useLayoutMode();
  const copilotOpen = useSelector((state: RootState) => state.ui.copilot.open);
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
  // In edit mode use the active tab; in view mode fall back to the URL doc id.
  const copilotDocumentId = activeTabId ?? routeDocId ?? "";

  const [activeEditorRef, setActiveEditorRef] = useState<
    RefObject<LexicalEditor | null>
  >(() => ({ current: null }));

  useEffect(() => {
    if (!initialized) dispatch(actions.load());
  }, [dispatch, initialized]);

  const isFocus = viewMode === "focus";
  const sidebarW = isFocus ? COMPACT_WIDTH : getEffectiveWidth();
  const railW = isFocus
    ? 0
    : railMode === "full"
    ? railWidth + RAIL_COMPACT_W
    : RAIL_COMPACT_W;

  const copilotCol = copilotOpen ? `${COPILOT_W}px ` : "";

  return (
    <TopBarTabsProvider>
      <SetActiveEditorContext.Provider value={setActiveEditorRef}>
        <ActiveEditorContext.Provider value={activeEditorRef}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: `${sidebarW}px 1fr ${copilotCol}${railW}px`,
              height: "100vh",
              overflow: "hidden",
              transition: isResizing || isRailResizing
                ? "none"
                : "grid-template-columns 225ms cubic-bezier(0.4, 0, 0.6, 1)",
            }}
          >
            <SideBar />
            <Box
              id="app-main"
              component="main"
              sx={{
                minWidth: 0,
                overflow: "auto",
                position: "relative",
              }}
            >
              <Box id="back-to-top-anchor" />
              <EditorTopBar />
              <FloatingOutlinePill />
              <HydrationManager>
                <Container
                  className="editor-container"
                  id="editor-main-container"
                  maxWidth={false}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    mx: isFocus ? "auto" : 0,
                    my: 2,
                    flex: 1,
                    position: "relative",
                    overflow: "auto",
                    width: "100%",
                    maxWidth: isFocus ? 720 : undefined,
                    pl: {
                      xs: 5,
                      sm: 10,
                      md: 12,
                    },
                    pr: {
                      xs: 4,
                      sm: 6,
                      md: 8,
                    },
                  }}
                >
                  {children}
                </Container>
              </HydrationManager>
            </Box>
            {copilotOpen && <CopilotPanel documentId={copilotDocumentId} />}
            <RightRail railMode={isFocus ? "hidden" : railMode} />
          </Box>
        </ActiveEditorContext.Provider>
      </SetActiveEditorContext.Provider>
    </TopBarTabsProvider>
  );
};

export default AppLayoutContent;
