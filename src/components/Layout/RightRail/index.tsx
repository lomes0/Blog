"use client";
import { useEffect, useState } from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import {
  Command,
  GitPullRequest,
  History,
  Info,
  Link as LinkIcon,
  PanelRightClose,
  PanelRightOpen,
  Settings,
  Sparkles,
  Table,
} from "lucide-react";
import SettingsPanel from "./SettingsPanel";
import { openCommandPalette } from "@/components/CommandPalette/CommandPalette";
import { selectAnySaveTrouble, useSelector } from "@/store";
import {
  selectFocusedDocId,
  selectFocusedPane,
} from "@/store/selectors/layoutSelectors";
import { type RailMode, useLayoutMode } from "@/contexts/LayoutModeContext";
import ResizeGripper from "../ResizeGripper";
import OutlineSection from "./OutlineSection";
import PropertiesSection from "./PropertiesSection";
import RevisionsSection from "./RevisionsSection";
import ProposalsSection from "./ProposalsSection";
import BacklinksSection from "./BacklinksSection";
import { ICON_SIZE } from "@/theme/icons";
import { uiCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";

// Must match the grid-template-columns transition duration in AppLayoutContent.
const TRANSITION_MS = 225;

interface RightRailProps {
  railMode: RailMode;
}

const RightRail: React.FC<RightRailProps> = ({ railMode }) => {
  const {
    toggleRail,
    isRailResizing,
    startRailResize,
    copilotOpen,
  } = useLayoutMode();
  const run = useCommandRun();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // The rail describes whatever pane has focus. It used to re-derive that from
  // the pathname — which meant it could not be told apart from a stale tab, and
  // could not have been told which of two panes to describe (plan §2.4).
  const pane = useSelector(selectFocusedPane);
  const rootId = pane?.rootId ?? null;
  const isEditMode = pane?.mode === "write";
  const activeDocId = useSelector(selectFocusedDocId);
  // Undefined unless something open is retrying or has failed to save.
  const saveTrouble = useSelector(selectAnySaveTrouble);
  // How much agent work is waiting on the author, across every document — not
  // just this one. See ProposalsSection.
  const pendingAgentChanges = useSelector((state) =>
    state.ui.proposals.count.total
  );

  // Keep the full panel in the DOM during the close animation so it clips
  // gradually as the grid column shrinks, instead of vanishing instantly.
  const [showPanel, setShowPanel] = useState(railMode === "full");
  useEffect(() => {
    if (railMode === "full") {
      setShowPanel(true);
    } else {
      const t = setTimeout(() => setShowPanel(false), TRANSITION_MS);
      return () => clearTimeout(t);
    }
  }, [railMode]);

  return (
    <Box
      component="aside"
      role="complementary"
      aria-label="Document information"
      sx={{ display: "flex", position: "relative" }}
    >
      {showPanel && (
        <>
          {/* Drag handle on the left edge of the full panel */}
          <ResizeGripper
            isResizing={isRailResizing}
            onMouseDown={startRailResize}
            label="Resize document information rail"
          />
          <Box
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
              overflowY: "auto",
              overflowX: "hidden",
              displayPrint: "none",
            }}
          >
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1 }}
            >
              {
                /* Above the document sections, and outside the "nothing open"
                  branch: an agent writes to whatever it was asked about, so the
                  work waiting on you is not a property of the document you
                  happen to have open. With nothing open it is the only thing
                  the rail can say — but only when there *is* something, or an
                  empty rail would grow a permanent empty section. */
              }
              {(rootId || pendingAgentChanges > 0) && (
                <ProposalsSection activeDocId={activeDocId} />
              )}
              {!rootId
                ? (
                  <Box
                    sx={{ p: 1, color: "text.disabled", typography: "caption" }}
                  >
                    Open a document to see its info here.
                  </Box>
                )
                : (
                  <>
                    <OutlineSection activeDocId={activeDocId} />
                    <PropertiesSection
                      rootId={rootId}
                      activeDocId={activeDocId}
                      isEditMode={isEditMode}
                    />
                    <RevisionsSection
                      rootId={rootId}
                      activeDocId={activeDocId}
                      isEditMode={isEditMode}
                    />
                    <BacklinksSection rootId={rootId} />
                  </>
                )}
            </Box>
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
        {
          /* The save-trouble badge lives here, on the one control that is
            mounted at *both* rail modes. The message itself is a row inside
            Properties, which is invisible while the rail is collapsed — which is
            exactly when a stuck save would otherwise go unnoticed for longest.
            See docs/plans/archive/quiet-autosave.md §3.3. */
        }
        <Tooltip
          title={saveTrouble
            ? (saveTrouble === "error"
              ? "A document couldn't be saved"
              : "Reconnecting — unsaved work is stored locally")
            : railMode === "full"
            ? "Collapse rail"
            : "Expand rail"}
          placement="left"
        >
          <IconButton
            size="small"
            onClick={toggleRail}
            aria-label={railMode === "full" ? "Collapse rail" : "Expand rail"}
            sx={{ position: "relative" }}
          >
            {railMode === "full"
              ? <PanelRightClose size={ICON_SIZE.dense} />
              : <PanelRightOpen size={ICON_SIZE.dense} />}
            {saveTrouble && (
              <Box
                component="span"
                aria-hidden
                sx={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  bgcolor: saveTrouble === "error"
                    ? "error.main"
                    : "warning.main",
                }}
              />
            )}
          </IconButton>
        </Tooltip>
        {
          /* Mounted at both rail modes, like the save-trouble badge above it and
            for the same reason: a collapsed rail is exactly when a terminal
            write would otherwise go unnoticed. It appears only when there is
            something — an always-present icon that is almost always inert is
            not awareness, it is furniture. */
        }
        {pendingAgentChanges > 0 && (
          <Tooltip
            title={pendingAgentChanges === 1
              ? "1 agent change waiting for review"
              : `${pendingAgentChanges} agent changes waiting for review`}
            placement="left"
          >
            <IconButton
              size="small"
              onClick={railMode === "compact" ? toggleRail : undefined}
              aria-label={pendingAgentChanges === 1
                ? "1 agent change waiting for review"
                : `${pendingAgentChanges} agent changes waiting for review`}
              sx={{ position: "relative", color: "primary.main" }}
            >
              <GitPullRequest size={ICON_SIZE.dense} />
              <Box
                component="span"
                aria-hidden
                sx={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  bgcolor: "primary.main",
                }}
              />
            </IconButton>
          </Tooltip>
        )}
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
        <Tooltip title="Outline" placement="left">
          <IconButton
            size="small"
            onClick={railMode === "compact" ? toggleRail : undefined}
            aria-label={railMode === "compact" ? "Expand rail" : "Outline"}
          >
            <Table size={ICON_SIZE.dense} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Properties" placement="left">
          <IconButton
            size="small"
            onClick={railMode === "compact" ? toggleRail : undefined}
            aria-label={railMode === "compact" ? "Expand rail" : "Properties"}
          >
            <Info size={ICON_SIZE.dense} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Revisions" placement="left">
          <IconButton
            size="small"
            onClick={railMode === "compact" ? toggleRail : undefined}
            aria-label={railMode === "compact" ? "Expand rail" : "Revisions"}
          >
            <History size={ICON_SIZE.dense} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Backlinks" placement="left">
          <IconButton
            size="small"
            onClick={railMode === "compact" ? toggleRail : undefined}
            aria-label={railMode === "compact" ? "Expand rail" : "Backlinks"}
          >
            <LinkIcon size={ICON_SIZE.dense} />
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

export default RightRail;
