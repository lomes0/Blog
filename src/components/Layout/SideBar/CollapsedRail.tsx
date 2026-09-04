"use client";
import React from "react";
import { Box, Tooltip } from "@mui/material";
import { FileText, Folder } from "lucide-react";
import type { SeriesGroupItem } from "@/utils/posts/seriesGrouping";
import { SafeNavigationLink } from "./SafeNavigationLink";
import { ICON_SIZE } from "@/theme/icons";
import { SB_ITEM_RADIUS } from "./constants";
import { type RootState, useSelector } from "@/store";
import { selectPaneShowingDoc } from "@/store/selectors/layoutSelectors";
import type { Post } from "@/types";
import {
  type AgentMarker,
  rollUpMarkers,
  selectMarkerByDocId,
} from "@/store/selectors/proposalSelectors";

/** The §2 tooltip/`aria-label` wording, one copy for both rail item kinds. */
const MARKER_LABELS = {
  pending: "Agent change waiting for review",
  stale: "Agent change is out of date — reject or re-run",
  renamed: "Agent proposed a new title — approve or reject",
  created: "Created by an agent, not yet accepted",
} as const;

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
        borderRadius: SB_ITEM_RADIUS,
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
 * Agent marker dot overlaid on a document/folder icon in the collapsed rail.
 *
 * This is the ONE place where color carries state alone, because a 6px dot
 * cannot be three different glyphs. DESIGN.md §10 forbids carrying state in
 * colour alone everywhere else, but the collapsed rail is icon-only chrome with
 * no label to sit beside — so the words go in the `aria-label` here and in the
 * rail item's own tooltip, which already names the document. The exception is
 * deliberate and scoped to this one surface.
 *
 * No `Tooltip` of its own: `RailItem` wraps every entry in one, and a second
 * inside it would race the first over a 6px target.
 */
const MarkerDot: React.FC<{ marker: AgentMarker; label: string }> = ({
  marker,
  label,
}) => (
  <Box
    component="span"
    role="img"
    aria-label={label}
    sx={{
      position: "absolute",
      // Bottom, not top: `CountBadge` holds the top-right corner on every
      // series folder, and a 6px dot placed there lands underneath it.
      bottom: 2,
      right: 2,
      width: 6,
      height: 6,
      borderRadius: "50%",
      // Stale uses warning.main (amber), pending/created use primary.main
      // (indigo). The glyph colour vocabulary from AgentMarker.tsx, adapted to
      // a dot that can only be two colours.
      bgcolor: marker === "stale" ? "warning.main" : "primary.main",
    }}
  />
);

/**
 * One standalone post's rail entry.
 *
 * Its own component so it can ask the store whether the post is open. This used
 * to be `pathname === "/edit/<id>"`, which is a derived copy of `ui.workspace`
 * and can only ever describe one pane — with a split open it left the other
 * pane's document looking closed (docs/plans/archive/workspace-url.md §4.2).
 * `selectPaneShowingDoc` answers for a tab as well as a pane root. The marker
 * arrives as a prop rather than a second subscription, so the rail keeps its
 * one `selectMarkerByDocId` read for the whole list.
 */
const PostRailItem: React.FC<{
  post: Post;
  marker: AgentMarker | null;
}> = ({ post, marker }) => {
  const selected = useSelector(
    (state: RootState) => selectPaneShowingDoc(state, post.id) !== null,
  );
  const name = post.title || "Untitled";
  const markerLabel = marker ? MARKER_LABELS[marker] : null;

  return (
    <RailItem
      // `/edit`, not `/view`: the rail is workspace chrome, and since Phase 4
      // `/view/[id]` is the store-free public page — a rail item pointing
      // there would close the panes the rail is drawn beside.
      href={`/edit/${post.id}`}
      selected={selected}
      title={markerLabel ? `${name} — ${markerLabel}` : name}
    >
      <FileText size={ICON_SIZE.dense} strokeWidth={1.7} />
      {marker && markerLabel && (
        <MarkerDot marker={marker} label={markerLabel} />
      )}
    </RailItem>
  );
};

/**
 * Compact "summary" rail shown when the sidebar is dragged shut: the file tree
 * collapses to one icon per top-level entry — a folder (with post count) for
 * each series collection and a file icon for each standalone post.
 */
export const CollapsedRail: React.FC<CollapsedRailProps> = ({
  groupedActivePosts,
  pathname,
}) => {
  // One subscription, one stable memoized map: every marked document and the
  // marker it carries. Reading a rail item's state is a key lookup, so the rail
  // does not re-render on store changes that touch no proposal.
  const markerByDocId = useSelector(selectMarkerByDocId);

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

          // The same roll-up SeriesGroup does, called directly rather than
          // through a `useMemo`: this runs inside a map, so there is no hook to
          // hang it on. `rollUpMarkers` is pure, so a repeat call is only the
          // walk itself.
          const { marker: groupMarker, count: totalCount } = rollUpMarkers(
            g.posts.map((post) => post.id),
            markerByDocId,
          );
          const markerLabel = groupMarker
            ? (totalCount > 1
              ? `${totalCount} agent changes inside`
              : MARKER_LABELS[groupMarker])
            : null;

          return (
            <RailItem
              key={`series-${g.series.id}`}
              href={href}
              selected={selected}
              title={markerLabel
                ? `${g.series.title} · ${g.posts.length} — ${markerLabel}`
                : `${g.series.title} · ${g.posts.length}`}
            >
              <Folder size={ICON_SIZE.dense} strokeWidth={1.7} />
              <CountBadge count={g.posts.length} />
              {groupMarker && markerLabel && (
                <MarkerDot marker={groupMarker} label={markerLabel} />
              )}
            </RailItem>
          );
        }

        const post = g.posts[0];
        if (!post) return null;

        return (
          <PostRailItem
            key={`post-${post.id}`}
            post={post}
            // Standalone post: its own marker, straight off the map.
            marker={markerByDocId[post.id] ?? null}
          />
        );
      })}
    </Box>
  );
};
