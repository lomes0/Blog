"use client";
import React from "react";
import { Box, Tooltip } from "@mui/material";
import { FileText, Folder } from "lucide-react";
import type { SeriesGroupItem } from "@/utils/posts/seriesGrouping";
import { SafeNavigationLink } from "./SafeNavigationLink";
import { ICON_SIZE } from "@/theme/icons";

interface CollapsedRailProps {
  /** All active-post groups: series collections and standalone posts. */
  groupedActivePosts: SeriesGroupItem[];
  pathname: string;
}

/** One icon-button entry in the compact rail (folder or file), with tooltip. */
const RailItem: React.FC<{
  href: string;
  selected: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ href, selected, title, children }) => (
  <Tooltip title={title} placement="right">
    <Box
      component={SafeNavigationLink}
      href={href}
      aria-current={selected ? "page" : undefined}
      sx={{
        position: "relative",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        borderRadius: 3,
        textDecoration: "none",
        color: selected ? "text.primary" : "text.secondary",
        bgcolor: selected ? "action.selected" : "transparent",
        "&:hover": {
          bgcolor: selected ? "action.selected" : "action.hover",
        },
      }}
    >
      {children}
    </Box>
  </Tooltip>
);

/** Small count badge overlaid on a folder icon. */
const CountBadge: React.FC<{ count: number }> = ({ count }) => (
  <Box
    component="span"
    sx={{
      position: "absolute",
      top: 1,
      right: 1,
      minWidth: 16,
      height: 16,
      px: "3px",
      borderRadius: 2,
      border: "1px solid",
      borderColor: "divider",
      bgcolor: "background.default",
      color: "text.secondary",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "10px",
      fontWeight: 650,
      lineHeight: 1,
      fontVariantNumeric: "tabular-nums",
    }}
  >
    {count > 99 ? "99+" : count}
  </Box>
);

/**
 * Compact "summary" rail shown when the sidebar is dragged shut: the file tree
 * collapses to one icon per top-level entry — a folder (with post count) for
 * each series collection and a file icon for each standalone post.
 */
export const CollapsedRail: React.FC<CollapsedRailProps> = ({
  groupedActivePosts,
  pathname,
}) => {
  if (groupedActivePosts.length === 0) {
    return <Box sx={{ flex: "1 1 auto", minHeight: 0 }} />;
  }

  return (
    <Box
      role="navigation"
      aria-label="Collections"
      sx={{
        flex: "1 1 auto",
        minHeight: 0,
        overflowY: "auto",
        overflowX: "hidden",
        overscrollBehavior: "contain",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.5,
        pt: 1,
        pb: 0.5,
      }}
    >
      {groupedActivePosts.map((g) => {
        if (g.type === "series" && g.series) {
          const href = `/posts/${g.series.id}`;
          const selected = pathname === href ||
            pathname.startsWith(`${href}/`);
          return (
            <RailItem
              key={`series-${g.series.id}`}
              href={href}
              selected={selected}
              title={`${g.series.title} · ${g.posts.length}`}
            >
              <Folder size={ICON_SIZE.dense} strokeWidth={1.7} />
              <CountBadge count={g.posts.length} />
            </RailItem>
          );
        }

        const post = g.posts[0];
        if (!post) return null;
        const doc = post;
        const name = doc?.name || "Untitled";
        // `/edit`, not `/view`: the rail is workspace chrome, and since Phase 4
        // `/view/[id]` is the store-free public page — a rail item pointing
        // there would close the panes the rail is drawn beside.
        const href = `/edit/${post.id}`;
        const selected = pathname === href;
        return (
          <RailItem
            key={`post-${post.id}`}
            href={href}
            selected={selected}
            title={name}
          >
            <FileText size={ICON_SIZE.dense} strokeWidth={1.7} />
          </RailItem>
        );
      })}
    </Box>
  );
};
