"use client";
import { Box, IconButton, Tooltip } from "@mui/material";
import { History, Info, Link as LinkIcon, Table } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSelector } from "@/store";
import { type RailMode, useLayoutMode } from "@/contexts/LayoutModeContext";
import OutlineSection from "./OutlineSection";
import PropertiesSection from "./PropertiesSection";
import RevisionsSection from "./RevisionsSection";
import BacklinksSection from "./BacklinksSection";

interface RightRailProps {
  railMode: RailMode;
}

const RightRail: React.FC<RightRailProps> = ({ railMode }) => {
  const { toggleRail, isRailResizing, startRailResize } = useLayoutMode();
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

  if (railMode === "hidden") return null;

  if (railMode === "compact") {
    return (
      <Box
        component="aside"
        role="complementary"
        aria-label="Document information"
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          pt: 1,
          gap: 0.5,
          borderLeft: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          height: "100vh",
          position: "sticky",
          top: 0,
          overflow: "hidden",
          flexShrink: 0,
          displayPrint: "none",
        }}
      >
        <Tooltip title="Expand outline" placement="left">
          <IconButton
            size="small"
            onClick={toggleRail}
            aria-label="Expand outline"
          >
            <Table size={18} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Expand properties" placement="left">
          <IconButton
            size="small"
            onClick={toggleRail}
            aria-label="Expand properties"
          >
            <Info size={18} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Expand revisions" placement="left">
          <IconButton
            size="small"
            onClick={toggleRail}
            aria-label="Expand revisions"
          >
            <History size={18} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Expand backlinks" placement="left">
          <IconButton
            size="small"
            onClick={toggleRail}
            aria-label="Expand backlinks"
          >
            <LinkIcon size={18} />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }

  return (
    <Box
      component="aside"
      role="complementary"
      aria-label="Document information"
      sx={{ position: "relative" }}
    >
      {/* Drag handle on the left edge */}
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
          bgcolor: "background.default",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          position: "sticky",
          top: 0,
          overflowY: "auto",
          overflowX: "hidden",
          flexShrink: 0,
          displayPrint: "none",
        }}
      >
        {!rootId
          ? (
            <Box sx={{ p: 2, color: "text.disabled", fontSize: "0.75rem" }}>
              Open a document to see its info here.
            </Box>
          )
          : (
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1 }}
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
    </Box>
  );
};

export default RightRail;
