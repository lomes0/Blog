"use client";

import React from "react";
import RouterLink from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, Box, Tooltip } from "@mui/material";
import { Code, Files, Newspaper, Search } from "lucide-react";
import { actions, type RootState, useDispatch, useSelector } from "@/store";
import type { SidebarView } from "@/types";
import { ICON_SIZE } from "@/theme/icons";
import { useSidebarWidth } from "@/contexts/SidebarWidthContext";
import { workspaceCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";
import { ACTIVITY_RAIL_W } from "./SideBar/constants";
import { CHROME_BAR_H } from "@/theme/tokens";
import RailIconButton from "./RailIconButton";

/**
 * Far-left activity rail. Switches the sidebar view (Explorer / Search) and
 * navigates to the Notes workspace. Renders as the first grid column in
 * AppLayoutContent.
 */
const ActivityRail: React.FC = () => {
  const dispatch = useDispatch();
  const run = useCommandRun();
  const pathname = usePathname();
  const sidebarView = useSelector((state: RootState) => state.ui.sidebarView);
  const user = useSelector((state: RootState) => state.user);
  const { sidebarOpen, sidebarMode, setSidebarMode } = useSidebarWidth();

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
        // No top padding: the brand chip below owns the chrome band instead, so
        // it centres on the same axis as the top bar's contents.
        pb: 0.5,
        displayPrint: "none",
        zIndex: (theme) => theme.zIndex.drawer + 1,
      }}
    >
      {
        /* Home / brand — the Refined-Explorer `</>` code glyph, in the same
          rounded chip as the view buttons. Links home. */
      }
      <RailIconButton
        label="Blog · Home"
        ariaLabel="Blog home"
        icon={<Code size={ICON_SIZE.dense} strokeWidth={1.9} />}
        href="/"
        // The shell's chrome band (DESIGN.md §17.1) rather than the 42px pitch
        // the buttons below use: this chip is the rail's title row, and it lines
        // up with the editor top bar and the two panel headers.
        sx={{ height: CHROME_BAR_H }}
      />
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

      <RailIconButton
        label="Explorer"
        icon={<Files size={ICON_SIZE.dense} strokeWidth={1.9} />}
        active={sidebarOpen && sidebarView === "explorer"}
        showBar
        onClick={() => handleViewClick("explorer")}
      />
      <RailIconButton
        label="Search"
        icon={<Search size={ICON_SIZE.dense} strokeWidth={1.9} />}
        active={sidebarOpen && sidebarView === "search"}
        showBar
        onClick={() => handleViewClick("search")}
      />
      <RailIconButton
        label="Posts"
        icon={<Newspaper size={ICON_SIZE.dense} strokeWidth={1.9} />}
        active={postsActive}
        showBar
        onClick={() =>
          run(workspaceCommands.openSection, { section: "library" })}
      />

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
