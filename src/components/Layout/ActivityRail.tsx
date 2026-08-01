"use client";

import React from "react";
import RouterLink from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, Box, Tooltip } from "@mui/material";
import {
  Code,
  Files,
  Newspaper,
  Search,
  Sparkles,
  StickyNote,
} from "lucide-react";
import { actions, type RootState, useDispatch, useSelector } from "@/store";
import type { SidebarView } from "@/types";
import { ICON_SIZE } from "@/theme/icons";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
import { useLayoutMode } from "@/contexts/LayoutModeContext";
import { uiCommands, workspaceCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";
import { ACTIVITY_RAIL_W } from "./SideBar/constants";
import { FOCUS_RING, MOTION } from "@/theme/tokens";

interface RailButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

/**
 * One activity-rail icon button, Refined-Explorer style: a centered 38×38
 * rounded chip that carries the hover/active tint, plus an accent bar pinned to
 * the rail's left edge when active. The accent purple (tint + glyph + bar) is
 * light-mode only; dark mode keeps the neutral action tokens ("dark later").
 */
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
        // 42px around a 38px chip → the handoff's 4px chip-to-chip gap.
        height: 42,
        p: 0,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        // Accent bar hugs the rail's left edge (not the chip) when active.
        "&::before": {
          content: '""',
          position: "absolute",
          left: 0,
          top: 12,
          bottom: 12,
          width: 3,
          borderRadius: "0 3px 3px 0",
          bgcolor: "accent.main",
          opacity: active ? 1 : 0,
          transition: `opacity ${MOTION.fast}ms`,
        },
        // Hover only lifts inactive chips — the active chip keeps its tint.
        ...(!active && {
          "&:hover .rail-chip": {
            bgcolor: "action.hover",
            color: "text.primary",
          },
        }),
        "&:focus-visible": {
          outline: "none",
          "& .rail-chip": { boxShadow: FOCUS_RING.chrome },
        },
      }}
    >
      <Box
        className="rail-chip"
        sx={{
          width: 38,
          height: 38,
          borderRadius: "11px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: active ? "accent.main" : "text.secondary",
          bgcolor: active ? "accent.tint" : "transparent",
          transition:
            `color ${MOTION.fast}ms, background-color ${MOTION.fast}ms`,
        }}
      >
        {children}
      </Box>
    </Box>
  </Tooltip>
);

/**
 * Far-left activity rail. Switches the sidebar view (Explorer / Search),
 * navigates to the Notes workspace, and toggles the AI panel. Renders as the
 * first grid column in AppLayoutContent.
 */
const ActivityRail: React.FC = () => {
  const dispatch = useDispatch();
  const run = useCommandRun();
  const pathname = usePathname();
  const sidebarView = useSelector((state: RootState) => state.ui.sidebarView);
  const user = useSelector((state: RootState) => state.user);
  const { sidebarOpen, sidebarMode, setSidebarMode } = useSidebarWidth();
  const { copilotOpen } = useLayoutMode();

  // A view button both selects its view and steps the sidebar's mode. Clicking
  // any *other* view opens the sidebar on it; clicking the one already showing
  // walks it narrower — full → compact → hidden — and then back open.
  //
  // The cycle exists because compact was otherwise unreachable without a drag:
  // it is a real mode with its own persisted state and its own pane, and a mode
  // you can only get to by dragging is a mode most users never find. It also
  // puts hiding one step further from a stray click than it used to be, which
  // is the same trade the drag geometry makes.
  //
  // None of these touch the remembered open width, so whatever route you take
  // back to `full` returns to the width you chose.
  const handleViewClick = (view: SidebarView) => {
    if (sidebarView !== view || sidebarMode === "hidden") {
      dispatch(actions.setSidebarView(view));
      setSidebarMode("full");
      return;
    }
    setSidebarMode(sidebarMode === "full" ? "compact" : "hidden");
  };

  const postsActive = pathname.startsWith("/posts");
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
      {
        /* Home / brand — the Refined-Explorer `</>` code glyph, in the same
          rounded chip as the view buttons. Links home. */
      }
      <Tooltip title="Blog · Home" placement="right">
        <Box
          component={RouterLink}
          href="/"
          aria-label="Blog home"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 42,
            flexShrink: 0,
            "&:hover .rail-chip": {
              bgcolor: "action.hover",
              color: "text.primary",
            },
          }}
        >
          <Box
            className="rail-chip"
            sx={{
              width: 38,
              height: 38,
              borderRadius: "11px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "text.secondary",
              transition: "color 0.15s, background-color 0.15s",
            }}
          >
            <Code size={ICON_SIZE.dense} strokeWidth={1.9} />
          </Box>
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
        <Files size={ICON_SIZE.dense} strokeWidth={1.9} />
      </RailButton>
      <RailButton
        label="Search"
        active={sidebarOpen && sidebarView === "search"}
        onClick={() => handleViewClick("search")}
      >
        <Search size={ICON_SIZE.dense} strokeWidth={1.9} />
      </RailButton>
      <RailButton
        label="Posts"
        active={postsActive}
        onClick={() => run(workspaceCommands.openSection, { section: "library" })}
      >
        <Newspaper size={ICON_SIZE.dense} strokeWidth={1.9} />
      </RailButton>
      <RailButton
        label="Notes"
        active={notesActive}
        onClick={() => run(workspaceCommands.openSection, { section: "notes" })}
      >
        <StickyNote size={ICON_SIZE.dense} strokeWidth={1.9} />
      </RailButton>
      <RailButton
        label={copilotOpen ? "Hide AI assistant" : "Show AI assistant"}
        active={copilotOpen}
        onClick={() => run(uiCommands.toggleCopilot)}
      >
        <Sparkles size={ICON_SIZE.dense} strokeWidth={1.9} />
      </RailButton>

      {/* Spacer pushes the account button to the bottom */}
      <Box sx={{ flex: 1 }} />

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
            sx={{
              width: 28,
              height: 28,
              fontSize: 12,
              fontWeight: 700,
              // No photo → the Refined-Explorer gradient chip with the user's
              // initial, instead of MUI's flat grey fallback. `background` takes
              // a gradient, not a palette colour, so it reads the generated
              // variable directly rather than via an `sx` palette path.
              ...(user && !user.image && {
                background: "var(--mui-palette-accent-avatarGradient)",
                color: "common.white",
              }),
            }}
          >
            {user && !user.image
              ? user.name?.trim()?.[0]?.toUpperCase()
              : undefined}
          </Avatar>
        </Box>
      </Tooltip>
    </Box>
  );
};

export default ActivityRail;
