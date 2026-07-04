"use client";

import React from "react";
import RouterLink from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, Box, Tooltip } from "@mui/material";
import { Command, Files, Search, Sparkles, StickyNote } from "lucide-react";
import { actions, type RootState, useDispatch, useSelector } from "@/store";
import type { SidebarView } from "@/types";
import { ICON_SIZE } from "@/theme/icons";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
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
  const user = useSelector((state: RootState) => state.user);
  const { sidebarOpen, sidebarMode, setSidebarMode } = useSidebarWidth();

  // A view button both selects its view and toggles the sidebar: clicking the
  // already-active view while fully open collapses the sidebar; clicking any
  // other view — or any view while collapsed/compact — opens it to full on that
  // view (so the compact drag-shut strip expands back with one click).
  const handleViewClick = (view: SidebarView) => {
    if (sidebarMode === "full" && sidebarView === view) {
      setSidebarMode("hidden");
    } else {
      dispatch(actions.setSidebarView(view));
      setSidebarMode("full");
    }
  };

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
      {/* Wordmark logo, pinned above the view switchers. Links home. */}
      <Tooltip title="Blog · Home" placement="right">
        <Box
          component={RouterLink}
          href="/"
          aria-label="Blog home"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 44,
            flexShrink: 0,
          }}
        >
          <Image src="/logo.svg" alt="Blog" width={28} height={28} />
        </Box>
      </Tooltip>
      <Box
        sx={{
          width: 24,
          height: "1px",
          bgcolor: "divider",
          alignSelf: "center",
          my: 0.5,
          flexShrink: 0,
        }}
      />

      <RailButton
        label="Explorer"
        active={sidebarOpen && sidebarView === "explorer"}
        onClick={() => handleViewClick("explorer")}
      >
        <Files size={ICON_SIZE.default} strokeWidth={1.8} />
      </RailButton>
      <RailButton
        label="Search"
        active={sidebarOpen && sidebarView === "search"}
        onClick={() => handleViewClick("search")}
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

      {/* Account — pinned to the very bottom of the rail. */}
      <Tooltip title={user ? user.name : "Sign In"} placement="right">
        <Box
          component={RouterLink}
          href={user ? "/dashboard" : "/api/auth/signin"}
          aria-label={user ? user.name : "Sign In"}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 44,
            flexShrink: 0,
          }}
        >
          <Avatar
            alt={user?.name}
            src={user?.image ?? undefined}
            sx={{ width: 28, height: 28 }}
          />
        </Box>
      </Tooltip>
    </Box>
  );
};

export default ActivityRail;
