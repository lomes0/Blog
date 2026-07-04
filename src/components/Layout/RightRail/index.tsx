"use client";
import { useEffect, useState } from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import {
  Command,
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
import { usePathname } from "next/navigation";
import { actions, useDispatch, useSelector } from "@/store";
import { type RailMode, useLayoutMode } from "@/contexts/LayoutModeContext";
import OutlineSection from "./OutlineSection";
import PropertiesSection from "./PropertiesSection";
import RevisionsSection from "./RevisionsSection";
import BacklinksSection from "./BacklinksSection";
import { ICON_SIZE } from "@/theme/icons";

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
  } = useLayoutMode();
  const dispatch = useDispatch();
  const copilotOpen = useSelector((state) => state.ui.copilot.open);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const mode = segments[0] === "edit"
    ? "edit"
    : segments[0] === "view"
    ? "view"
    : null;
  const rootId = mode ? segments[1] ?? null : null;

  const activeTabId = useSelector((state) => state.ui.tabs.activeTabId);
  const activeDocId = mode === "edit" ? (activeTabId ?? rootId) : rootId;

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

  if (railMode === "hidden") return null;

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
          <Box
            onMouseDown={startRailResize}
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: 4,
              cursor: "col-resize",
              backgroundColor: isRailResizing ? "primary.main" : "transparent",
              transition: isRailResizing ? "none" : "background-color 0.2s",
              "&:hover": { backgroundColor: "primary.main", opacity: 0.5 },
              "&:active": { backgroundColor: "primary.main", opacity: 1 },
              zIndex: 1300,
            }}
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
            {!rootId
              ? (
                <Box
                  sx={{ p: 2, color: "text.disabled", typography: "caption" }}
                >
                  Open a document to see its info here.
                </Box>
              )
              : (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    p: 1,
                  }}
                >
                  <OutlineSection activeDocId={activeDocId} />
                  <PropertiesSection
                    rootId={rootId}
                    activeDocId={activeDocId}
                    isEditMode={mode === "edit"}
                  />
                  <RevisionsSection
                    rootId={rootId}
                    activeDocId={activeDocId}
                    isEditMode={mode === "edit"}
                  />
                  <BacklinksSection rootId={rootId} />
                </Box>
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
        <Tooltip
          title={railMode === "full" ? "Collapse rail" : "Expand rail"}
          placement="left"
        >
          <IconButton
            size="small"
            onClick={toggleRail}
            aria-label={railMode === "full" ? "Collapse rail" : "Expand rail"}
          >
            {railMode === "full"
              ? <PanelRightClose size={ICON_SIZE.dense} />
              : <PanelRightOpen size={ICON_SIZE.dense} />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Copilot" placement="left">
          <IconButton
            size="small"
            color={copilotOpen ? "primary" : "default"}
            onClick={() => dispatch(actions.setCopilotOpen(!copilotOpen))}
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
