"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import { Command, Settings, Sparkles } from "lucide-react";
import SettingsPanel from "./SettingsPanel";
import { openCommandPalette } from "@/components/CommandPalette/CommandPalette";
import { selectAnySaveTrouble, useSelector } from "@/store";
import {
  selectFocusedDocId,
  selectFocusedPane,
} from "@/store/selectors/layoutSelectors";
import { useLayoutMode } from "@/contexts/LayoutModeContext";
import ResizeGripper from "../ResizeGripper";
import OutlineSection from "./OutlineSection";
import PropertiesSection from "./PropertiesSection";
import RevisionsSection from "./RevisionsSection";
import ProposalsSection from "./ProposalsSection";
import BacklinksSection from "./BacklinksSection";
import PanelHeader from "./PanelHeader";
import ViewRail from "./ViewRail";
import { ICON_SIZE } from "@/theme/icons";
import { uiCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";
import { type ViewId, VIEW_IDS } from "./panelState";
import { useRailPanel } from "./useRailPanel";
import {
  useBacklinks,
  useOutlineHeadings,
  useViewSignals,
} from "./useViewData";

// Must match the grid-template-columns transition duration in AppLayoutContent.
const TRANSITION_MS = 225;

/**
 * The right rail: a permanent icon strip, and a panel showing one view.
 *
 * The panel used to render all five sections at once as a stack of collapsible
 * cards, and the strip could only toggle the whole thing open or shut — its
 * view icons did nothing at all once it was open. Now the strip switches views
 * and the panel shows the one you picked.
 *
 * **There is no open/closed state here.** The panel is open iff a view is
 * showing; `useRailPanel` derives that and `AppLayoutContent` sizes its grid
 * column from the same derivation. Closing the view is what collapses the
 * panel, and the strip stays either way.
 */
const RightRail: React.FC = () => {
  const { isRailResizing, startRailResize, copilotOpen } = useLayoutMode();
  const run = useCommandRun();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const pane = useSelector(selectFocusedPane);
  const rootId = pane?.rootId ?? null;
  const isEditMode = pane?.mode === "write";
  const activeDocId = useSelector(selectFocusedDocId);
  // Undefined unless something open is retrying or has failed to save.
  const saveTrouble = useSelector(selectAnySaveTrouble);

  const { view, open, selectView, closePanel } = useRailPanel();

  // Read once, here, and handed to both the rail's badges and the sections.
  // See `useViewData.ts` for why this is not each view's own business.
  const headings = useOutlineHeadings(activeDocId);
  const { backlinks, loading: backlinksLoading } = useBacklinks(rootId);
  const signals = useViewSignals(
    rootId,
    activeDocId,
    headings.length,
    backlinks.length,
    backlinksLoading,
  );

  // Keep the panel in the DOM during the close animation so it clips gradually
  // as the grid column shrinks, instead of vanishing instantly.
  const [showPanel, setShowPanel] = useState(open);
  useEffect(() => {
    if (open) {
      setShowPanel(true);
    } else {
      const t = setTimeout(() => setShowPanel(false), TRANSITION_MS);
      return () => clearTimeout(t);
    }
  }, [open]);

  /**
   * `Cmd/Ctrl+1..5`, and `Escape` inside the panel.
   *
   * Escape is shared with the pane un-maximize in `WorkspacePanes`, which is
   * why this one only fires when focus is actually inside the panel, and marks
   * the event handled so the two cannot both act on one press.
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && !e.shiftKey && !e.altKey && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        selectView(VIEW_IDS[Number(e.key) - 1]);
        return;
      }
      if (
        e.key === "Escape" && !e.defaultPrevented && open &&
        panelRef.current?.contains(document.activeElement)
      ) {
        e.preventDefault();
        closePanel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectView, closePanel, open]);

  /**
   * A view's content.
   *
   * Built here rather than in a lookup table because the five take five
   * different sets of props, two of which are the lifted data above. A table of
   * components would have to pass every prop to every view.
   */
  const renderView = useCallback((view: ViewId) => {
    switch (view) {
      case "agent-changes":
        return <ProposalsSection activeDocId={activeDocId} />;
      case "outline":
        return rootId
          ? <OutlineSection activeDocId={activeDocId} headings={headings} />
          : <NothingOpen />;
      case "properties":
        return rootId
          ? (
            <PropertiesSection
              rootId={rootId}
              activeDocId={activeDocId}
              isEditMode={isEditMode}
            />
          )
          : <NothingOpen />;
      case "revisions":
        return rootId
          ? (
            <RevisionsSection
              rootId={rootId}
              activeDocId={activeDocId}
              isEditMode={isEditMode}
            />
          )
          : <NothingOpen />;
      case "backlinks":
        return rootId
          ? <BacklinksSection backlinks={backlinks} loading={backlinksLoading} />
          : <NothingOpen />;
    }
  }, [
    activeDocId,
    rootId,
    isEditMode,
    headings,
    backlinks,
    backlinksLoading,
  ]);

  return (
    <Box
      component="aside"
      role="complementary"
      aria-label="Document information"
      sx={{ display: "flex", position: "relative" }}
    >
      {showPanel && (
        <>
          {/* Drag handle on the left edge of the panel */}
          <ResizeGripper
            isResizing={isRailResizing}
            onMouseDown={startRailResize}
            label="Resize document information rail"
          />
          <Box
            ref={panelRef}
            role="region"
            aria-labelledby="rail-panel-title"
            sx={{
              borderLeft: "1px solid",
              borderColor: "divider",
              bgcolor: "background.panel",
              display: "flex",
              flexDirection: "column",
              height: "100vh",
              flex: 1,
              position: "sticky",
              top: 0,
              overflow: "hidden",
              displayPrint: "none",
            }}
          >
            {view && (
              <>
                <PanelHeader
                  view={view}
                  count={signals[view].count}
                  onClose={closePanel}
                />
                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    overflowX: "hidden",
                    px: 1.25,
                    py: 1,
                    bgcolor: "background.default",
                  }}
                >
                  {renderView(view)}
                </Box>
              </>
            )}
          </Box>
        </>
      )}

      {/* Compact strip — always visible as the constant right border rail */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          pt: 1,
          gap: 0.5,
          borderLeft: "1px solid",
          borderColor: "divider",
          bgcolor: "background.panel",
          height: "100vh",
          width: 54,
          flexShrink: 0,
          position: "sticky",
          top: 0,
          overflow: "hidden",
          displayPrint: "none",
        }}
      >
        <ViewRail current={view} signals={signals} onSelect={selectView} />

        {
          /* The save-trouble indicator. It used to hang off the collapse
            button, which was the one control mounted at both rail modes; there
            is no collapse button any more, so it is its own row — still always
            present, which is the property that mattered. A stuck save goes
            unnoticed longest exactly when the panel is closed, and Properties
            (which carries the message) is then not on screen. See
            docs/plans/archive/quiet-autosave.md §3.3. */
        }
        {saveTrouble && (
          <Tooltip
            title={saveTrouble === "error"
              ? "A document couldn't be saved"
              : "Reconnecting — unsaved work is stored locally"}
            placement="left"
          >
            <IconButton
              size="small"
              onClick={() => selectView("properties")}
              aria-label={saveTrouble === "error"
                ? "A document couldn't be saved"
                : "Reconnecting — unsaved work is stored locally"}
              sx={{
                color: saveTrouble === "error" ? "error.main" : "warning.main",
              }}
            >
              <Box
                component="span"
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: "currentColor",
                }}
              />
            </IconButton>
          </Tooltip>
        )}

        <Box
          sx={{
            width: 24,
            height: "1px",
            bgcolor: "divider",
            my: 0.5,
            flexShrink: 0,
          }}
        />

        <Tooltip title="Copilot" placement="left">
          <IconButton
            size="small"
            color={copilotOpen ? "primary" : "default"}
            onClick={() => run(uiCommands.toggleCopilot)}
            aria-label="Toggle Copilot"
          >
            <Sparkles size={ICON_SIZE.dense} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Command palette" placement="left">
          <IconButton
            size="small"
            onClick={openCommandPalette}
            aria-label="Command palette"
            sx={{ mt: "auto" }}
          >
            <Command size={ICON_SIZE.dense} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Settings" placement="left">
          <IconButton
            size="small"
            color={settingsOpen ? "primary" : "default"}
            onClick={() => setSettingsOpen((prev) => !prev)}
            aria-label="Settings"
            sx={{ mb: 1 }}
          >
            <Settings size={ICON_SIZE.dense} />
          </IconButton>
        </Tooltip>
      </Box>
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </Box>
  );
};

/**
 * What a document-scoped view shows with an empty workspace.
 *
 * Four of the five views describe a document, so with nothing open they have
 * nothing to describe. Agent changes is the exception and renders normally —
 * an agent writes to whatever it was asked about, so work waiting on the author
 * is not a property of the document that happens to be open.
 */
const NothingOpen = () => (
  <Box sx={{ color: "text.disabled", typography: "caption" }}>
    Open a document to see its info here.
  </Box>
);

export default RightRail;
