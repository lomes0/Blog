"use client";
import React from "react";
import { Box, Tooltip } from "@mui/material";
import { Folder } from "lucide-react";
import type { SeriesGroupItem } from "@/utils/posts/seriesGrouping";
import { SafeNavigationLink } from "./SafeNavigationLink";

interface CollapsedRailProps {
  /** All active-post groups; only `series` groups become rail entries. */
  groupedActivePosts: SeriesGroupItem[];
  pathname: string;
}

/**
 * Collapsed "Nav rail" (design direction A): the folder tree collapses to one
 * icon per series collection with a small count badge. Standalone (non-series)
 * posts have no folder, so the rail is series-only. Primary nav and the user
 * footer are rendered by the parent and persist above/below this region.
 */
export const CollapsedRail: React.FC<CollapsedRailProps> = ({
  groupedActivePosts,
  pathname,
}) => {
  const seriesGroups = groupedActivePosts.filter(
    (g): g is SeriesGroupItem & { series: NonNullable<SeriesGroupItem["series"]> } =>
      g.type === "series" && Boolean(g.series),
  );

  if (seriesGroups.length === 0) {
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
        pb: 0.5,
      }}
    >
      {/* Divider separating primary nav (above) from the collections rail. */}
      <Box
        sx={{
          width: 30,
          height: "1px",
          bgcolor: "divider",
          my: 0.5,
          flexShrink: 0,
        }}
      />

      {seriesGroups.map((g) => {
        const href = `/posts/${g.series.id}`;
        const selected = pathname === href || pathname.startsWith(`${href}/`);
        const count = g.posts.length;
        return (
          <Tooltip
            key={g.series.id}
            title={`${g.series.title} · ${count}`}
            placement="right"
          >
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
                borderRadius: "12px",
                textDecoration: "none",
                color: selected ? "text.primary" : "text.secondary",
                bgcolor: selected ? "action.selected" : "transparent",
                "&:hover": {
                  bgcolor: selected ? "action.selected" : "action.hover",
                },
              }}
            >
              <Folder size={20} strokeWidth={1.7} />
              <Box
                component="span"
                sx={{
                  position: "absolute",
                  top: 1,
                  right: 1,
                  minWidth: 16,
                  height: 16,
                  px: "3px",
                  borderRadius: "8px",
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
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
};
