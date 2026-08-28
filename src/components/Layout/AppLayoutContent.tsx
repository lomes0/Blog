"use client";
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { LexicalEditor } from "lexical";
import SideBar from "./SideBar";
import ActivityRail from "./ActivityRail";
import SidebarResizeHandle from "./SideBar/SidebarResizeHandle";
import { ACTIVITY_RAIL_W } from "./SideBar/constants";
import { CONTENT_PAD_X } from "./contentInset";
import HydrationManager from "./HydrationManager";
import EditorTopBar from "./EditorTopBar";
import RightRail from "./RightRail";
import StatusBar from "./StatusBar";
import CopilotPanel from "@/components/CopilotPanel/CopilotPanel";
import InlineCopilotBar, {
  hasInlineCopilotBar,
  INLINE_BAR_CLEARANCE,
} from "@/components/CopilotPanel/InlineCopilotBar";
import CommandPalette from "@/components/CommandPalette/CommandPalette";
import { Box, Container } from "@mui/material";
import { actions, type RootState, useDispatch, useSelector } from "@/store";
import { selectFocusedDocId } from "@/store/selectors/layoutSelectors";
import { useBackgroundRefresh } from "@/hooks/useBackgroundRefresh";
import { useChangeFeed } from "@/hooks/useChangeFeed";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
import { useLayoutMode } from "@/contexts/LayoutModeContext";
import { usePathname } from "next/navigation";
import { RAIL_COMPACT_W } from "@/contexts/LayoutModeContext";
import {
  ActiveEditorContext,
  SetActiveEditorContext,
} from "@/contexts/ActiveEditorContext";
import { hiddenScrollbarSx } from "@/theme/tokens";

// Must match the grid-template-columns transition duration below.
const COPILOT_TRANSITION_MS = 225;

const AppLayoutContent = ({ children }: { children: React.ReactNode }) => {
  const dispatch = useDispatch();
  const initialized = useSelector((state: RootState) => state.ui.initialized);
  const { noWidthMotion, sidebarWidth } = useSidebarWidth();
  const {
    railMode,
    railWidth,
    isRailResizing,
    copilotOpen,
    copilotWidth,
    isCopilotResizing,
  } = useLayoutMode();
  const pathname = usePathname();
  /** The editor route — the only one whose scroller opens on chrome. */
  const isWorkspace = pathname.startsWith("/edit");
  // What the Copilot is talking about: the focused pane's active document, and
  // `null` when nothing is open — which is when the Copilot talks about the
  // library instead, what the home pane's composer opens it for.
  //
  // This used to be derived by splitting the pathname, with one rule for
  // `/view` and another for `/edit`. Workspace state answers it directly now
  // (plan §2.4), so the two rules collapse into one and the answer is right in
  // a split view, where no path could name the left pane.
  const copilotDocumentId = useSelector(selectFocusedDocId);

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

  // The app shell is the one place these belong: what they fetch feeds the
  // sidebar, the right rail and the review bar, and a second mount would be a
  // second SSE connection per tab and a second pair of requests on every window
  // focus. The feed is the primary signal and the poll is its fallback for when
  // the stream is down (docs/plans/archive/changes-detection.md §7) — both converge on
  // the same catch-up, so having both cannot leave the store in two states.
  useChangeFeed();
  useBackgroundRefresh();

  const railW = railMode === "full"
    ? railWidth + RAIL_COMPACT_W
    : RAIL_COMPACT_W;

  // Always keep the column present (0px when closed) so its width can animate
  // open/closed instead of the track appearing/disappearing.
  const copilotCol = `${copilotOpen ? copilotWidth : 0}px `;

  return (
    <SetActiveEditorContext.Provider value={setActiveEditorRef}>
      <ActiveEditorContext.Provider value={activeEditorRef}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns:
              `${ACTIVITY_RAIL_W}px ${sidebarWidth}px 1fr ${copilotCol}${railW}px`,
            height: "100vh",
            overflow: "hidden",
            // A sidebar drag never reaches this: it previews its destination
            // and leaves the column alone until release, and the release lands
            // instantly — the content edge has to arrive with the panel, and
            // the panel does not animate onto a width the user has been
            // watching an outline of. The rail and Copilot still drag live, so
            // their columns still have to opt out per frame.
            transition: noWidthMotion || isRailResizing || isCopilotResizing
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
            {
              /* The document column proper — the scroller and the bar that
                  floats over it — as one positioned block, so the status bar
                  below is a *sibling* of the pair rather than something the
                  Copilot bar's `bottom: 0` would sit on top of. Without this
                  wrapper the two share `#app-main` and overlap by ~10px. */
            }
            <Box
              sx={{
                position: "relative",
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <HydrationManager>
                <Container
                  className="editor-container"
                  id="editor-main-container"
                  maxWidth={false}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    mx: 0,
                    // The workspace gets no top margin: the first thing in its
                    // scroller is a sticky pane header, and a header is chrome —
                    // it has to meet the bar above it. This margin used to fall
                    // *below* the toolbar, which hung outside the scroller in the
                    // app shell; moving the toolbar into the pane put the same
                    // 16px above it, as a band of background that never scrolls
                    // away. Every other route still opens on content, which wants
                    // the breathing room.
                    mt: isWorkspace ? 0 : 2,
                    mb: 2,
                    flex: 1,
                    minHeight: 0,
                    position: "relative",
                    overflow: "auto",
                    // A stacking context, so that every z-index raised *inside*
                    // the document stays inside it. `position: relative` alone
                    // does not make one (z-index stays `auto`), and neither does
                    // `overflow` — so plugin chrome that portals out of the
                    // Lexical subtree and asserts a z-index used to resolve as a
                    // sibling of the Copilot bar in the root stacking context and
                    // paint straight over it. The code block's header/footer
                    // (z-index 24) and language menu (30) beat the bar's 3 and
                    // sliced across the chat card. Isolating here fixes the whole
                    // class rather than that one pair, which is why it is not a
                    // larger number on the bar: content passes *under* the bar,
                    // and that has to hold for the next plugin too.
                    isolation: "isolate",
                    width: "100%",
                    // The editor route alone — DESIGN.md §12's exception. Every
                    // other route's overflow is a page of cards that wants its
                    // bar; the workspace's is a document whose scroller *is* the
                    // page, so the bar is a permanent rule down its inside edge,
                    // and a split draws two of them, one against the splitter.
                    // Scrolling is untouched, only the indicator.
                    ...(isWorkspace ? hiddenScrollbarSx : {}),
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
                    away with the document it is asking about. The wrapper above
                    is the positioned ancestor it hangs from — it used to be
                    `#app-main`, which now also holds the status bar. */
              }
              <InlineCopilotBar documentId={copilotDocumentId} />
            </Box>
            {
              /* Workspace chrome, not app chrome. Two of its four readings —
                  word count and read-time — are properties of an open document,
                  so on `/posts` or `/user/…` the bar would be a permanent empty
                  strip. `/edit` is the only route in this shell that has panes
                  at all (`/view/[id]` renders `PublicShell` instead), which
                  makes it exactly the scope where every field has an answer.

                  Full width of the document column rather than of the window:
                  the four chrome columns beside it are each `100vh` and two of
                  them are `position: fixed`/`sticky`, so a bar under all five
                  would have to thread its height back through every one of
                  them. It reads as a footer to the thing it describes. */
            }
            {isWorkspace && <StatusBar />}
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
  );
};

export default AppLayoutContent;
