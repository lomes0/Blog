"use client";

import React from "react";
import RouterLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, Box, Tooltip } from "@mui/material";
import { Code, Files, Search, Sparkles, StickyNote } from "lucide-react";
import { actions, type RootState, useDispatch, useSelector } from "@/store";
import type { SidebarView } from "@/types";
import { ICON_SIZE } from "@/theme/icons";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
import { ACTIVITY_RAIL_W, SB_ACCENT } from "./SideBar/constants";

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
      sx={(theme) => ({
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
          bgcolor: "primary.main",
          opacity: active ? 1 : 0,
          transition: "opacity 0.15s",
          ...(active &&
            theme.applyStyles("light", { backgroundColor: SB_ACCENT.main })),
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
          "& .rail-chip": {
            boxShadow:
              "0 0 0 2px rgba(var(--mui-palette-primary-mainChannel) / 0.6)",
          },
        },
      })}
    >
      <Box
        className="rail-chip"
        sx={(theme) => ({
          width: 38,
          height: 38,
          borderRadius: "11px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: active ? "text.primary" : "text.secondary",
          bgcolor: active ? "action.selected" : "transparent",
          transition: "color 0.15s, background-color 0.15s",
          ...(active &&
            theme.applyStyles("light", {
              color: SB_ACCENT.main,
              backgroundColor: SB_ACCENT.tint,
            })),
        })}
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
      {/* Home / brand — the Refined-Explorer `</>` code glyph, in the same
          rounded chip as the view buttons. Links home. */}
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
        label="Notes"
        active={notesActive}
        onClick={() => router.push("/notes")}
      >
        <StickyNote size={ICON_SIZE.dense} strokeWidth={1.9} />
      </RailButton>
      <RailButton
        label={copilotOpen ? "Hide AI assistant" : "Show AI assistant"}
        active={copilotOpen}
        onClick={() => dispatch(actions.setCopilotOpen(!copilotOpen))}
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
            sx={(theme) => ({
              width: 28,
              height: 28,
              fontSize: 12,
              fontWeight: 700,
              // No photo → the Refined-Explorer gradient chip with the user's
              // initial (light mode only), instead of MUI's flat grey fallback.
              ...(user && !user.image &&
                theme.applyStyles("light", {
                  background: SB_ACCENT.avatarGradient,
                  color: "#fff",
                })),
            })}
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
