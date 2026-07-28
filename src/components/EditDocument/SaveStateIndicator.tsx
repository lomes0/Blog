"use client";
import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import { postsSelectors, useSelector } from "@/store";
import type { RootState } from "@/store";
import type { SaveStatus } from "@/types";
import { shallowEqual } from "react-redux";

interface SaveStateIndicatorProps {
  docId: string;
  /** Render just the colored dot (no text) */
  dotOnly?: boolean;
}

function relativeTime(date: Date): string {
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

/**
 * Colour and wording per save state.
 *
 * `retrying` deliberately reads as reassurance, not alarm: the edit is already
 * in the pending-save buffer and will land when the connection returns, so it
 * takes the informational blue rather than the error red.
 */
function describe(
  status: SaveStatus,
  isDirty: boolean,
  timeLabel?: string,
): { color: string; label: string } {
  switch (status) {
    case "saving":
      return { color: "info.main", label: "Saving…" };
    case "retrying":
      return { color: "info.main", label: "Reconnecting…" };
    case "error":
      return { color: "error.main", label: "Save failed" };
    default:
      if (isDirty) return { color: "warning.main", label: "Unsaved changes" };
      return {
        color: "success.main",
        label: timeLabel ? `Saved ${timeLabel}` : "Saved",
      };
  }
}

export default function SaveStateIndicator({
  docId,
  dotOnly = false,
}: SaveStateIndicatorProps) {
  const [, setTick] = useState(0);

  const { isDirty, updatedAt, status } = useSelector(
    (state: RootState) => ({
      isDirty: state.ui.tabs.dirtyTabIds.includes(docId),
      updatedAt: postsSelectors.selectById(state, docId)?.updatedAt,
      status: state.ui.saveStatus[docId] ?? ("idle" as SaveStatus),
    }),
    shallowEqual,
  );

  const isSettled = status === "idle" && !isDirty;

  // Re-render every 30 s so the "Xs ago" label stays fresh
  useEffect(() => {
    if (!isSettled || !updatedAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [isSettled, updatedAt]);

  const timeLabel = isSettled && updatedAt
    ? relativeTime(new Date(updatedAt))
    : undefined;
  const { color, label } = describe(status, isDirty, timeLabel);

  if (dotOnly) {
    return (
      <Box
        component="span"
        aria-label={label}
        sx={{
          display: "inline-block",
          width: 7,
          height: 7,
          borderRadius: "50%",
          bgcolor: color,
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        verticalAlign: "middle",
      }}
    >
      <Box
        component="span"
        sx={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          bgcolor: color,
          flexShrink: 0,
        }}
      />
      <Typography
        component="span"
        variant="caption"
        color="text.secondary"
        noWrap
        sx={{
          fontWeight: 400,
          lineHeight: 1,
          minWidth: 92,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}
