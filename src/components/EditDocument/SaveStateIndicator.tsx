"use client";
import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import { documentsSelectors, useSelector } from "@/store";
import type { RootState } from "@/store";
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

export default function SaveStateIndicator({
  docId,
  dotOnly = false,
}: SaveStateIndicatorProps) {
  const [, setTick] = useState(0);

  const { isDirty, updatedAt } = useSelector(
    (state: RootState) => {
      const dirty = state.ui.tabs.dirtyTabIds.includes(docId);
      const doc = documentsSelectors.selectById(state, docId);
      return {
        isDirty: dirty,
        updatedAt: doc?.local?.updatedAt ?? doc?.cloud?.updatedAt,
      };
    },
    shallowEqual,
  );

  // Re-render every 30 s so the "Xs ago" label stays fresh
  useEffect(() => {
    if (isDirty || !updatedAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [isDirty, updatedAt]);

  const dotColor = isDirty ? "warning.main" : "success.main";

  if (dotOnly) {
    return (
      <Box
        component="span"
        aria-label={isDirty ? "Unsaved changes" : "Saved"}
        sx={{
          display: "inline-block",
          width: 7,
          height: 7,
          borderRadius: "50%",
          bgcolor: dotColor,
          flexShrink: 0,
        }}
      />
    );
  }

  const timeLabel = !isDirty && updatedAt
    ? relativeTime(new Date(updatedAt))
    : undefined;

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
          bgcolor: dotColor,
          flexShrink: 0,
        }}
      />
      <Typography
        component="span"
        variant="caption"
        color="text.secondary"
        sx={{ fontWeight: 400, lineHeight: 1 }}
      >
        {isDirty
          ? "Unsaved changes"
          : timeLabel
          ? `Saved ${timeLabel}`
          : "Saved"}
      </Typography>
    </Box>
  );
}
