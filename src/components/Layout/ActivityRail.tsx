"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Box, Tooltip } from "@mui/material";
import { Command, Files, Search, Sparkles, StickyNote } from "lucide-react";
import { actions, type RootState, useDispatch, useSelector } from "@/store";
import type { SidebarView } from "@/types";
import { ICON_SIZE } from "@/theme/icons";
import { ACTIVITY_RAIL_W } from "./SideBar/constants";
import { openCommandPalette } from "@/components/CommandPalette/CommandPalette";

interface RailButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

/** One activity-rail icon button: accent bar on the left edge + tint when active. */
const RailButton: React.FC<RailButtonProps> = (
  { label, active, onClick, children },
) => (
  <Tooltip title={label} placement="right">
    <Box
      component="button"
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      sx={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: 44,
        border: "none",
        cursor: "pointer",
        color: active ? "text.primary" : "text.secondary",
        bgcolor: active ? "action.selected" : "transparent",
        transition: "color 0.15s, background-color 0.15s",
        "&:hover": { color: "text.primary", bgcolor: "action.hover" },
        "&:focus-visible": {
          outline: "none",
          boxShadow:
            "inset 0 0 0 2px rgba(var(--mui-palette-primary-mainChannel) / 0.6)",
        },
        "&::before": {
          content: '""',
          position: "absolute",
          left: 0,
          top: 8,
          bottom: 8,
          width: 2,
          borderRadius: 2,
          bgcolor: "primary.main",
          opacity: active ? 1 : 0,
          transition: "opacity 0.15s",
        },
      }}
    >
      {children}
    </Box>
  </Tooltip>
);

/**
 * Far-left activity rail. Switches the sidebar view (Explorer / Search),
 * navigates to the Notes workspace, toggles the AI panel, and opens the command
 * palette. Renders as the first grid column in AppLayoutContent.
 */
const ActivityRail: React.FC = () => {
  const dispatch = useDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const sidebarView = useSelector((state: RootState) => state.ui.sidebarView);
  const copilotOpen = useSelector((state: RootState) => state.ui.copilot.open);

  const selectView = (view: SidebarView) =>
    dispatch(actions.setSidebarView(view));

  const notesActive = pathname.startsWith("/notes");

  return (
    <Box
      component="nav"
      aria-label="Activity rail"
      sx={{
        width: ACTIVITY_RAIL_W,
        height: "100vh",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        bgcolor: "background.rail",
        borderRight: "1px solid",
        borderColor: "divider",
        py: 0.5,
        displayPrint: "none",
        zIndex: (theme) => theme.zIndex.drawer + 1,
      }}
    >
      <RailButton
        label="Explorer"
        active={sidebarView === "explorer"}
        onClick={() => selectView("explorer")}
      >
        <Files size={ICON_SIZE.default} strokeWidth={1.8} />
      </RailButton>
      <RailButton
        label="Search"
        active={sidebarView === "search"}
        onClick={() => selectView("search")}
      >
        <Search size={ICON_SIZE.default} strokeWidth={1.8} />
      </RailButton>
      <RailButton
        label="Notes"
        active={notesActive}
        onClick={() => router.push("/notes")}
      >
        <StickyNote size={ICON_SIZE.default} strokeWidth={1.8} />
      </RailButton>
      <RailButton
        label={copilotOpen ? "Hide AI assistant" : "Show AI assistant"}
        active={copilotOpen}
        onClick={() => dispatch(actions.setCopilotOpen(!copilotOpen))}
      >
        <Sparkles size={ICON_SIZE.default} strokeWidth={1.8} />
      </RailButton>

      {/* Spacer pushes the palette button to the bottom */}
      <Box sx={{ flex: 1 }} />

      <RailButton
        label="Command palette"
        active={false}
        onClick={openCommandPalette}
      >
        <Command size={ICON_SIZE.default} strokeWidth={1.8} />
      </RailButton>
    </Box>
  );
};

export default ActivityRail;
