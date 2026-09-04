"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, type Theme, Typography } from "@mui/material";
import {
  clampRatio,
  CONTENT_SLOT_MAX_SHARE,
  type PanelState,
  type SlotIndex,
  sizingMode,
  type ViewId,
  viewAt,
} from "./panelState";
import { preferredHeightOf } from "./views";
import SlotHeader from "./SlotHeader";
import { MOTION } from "@/theme/tokens";

interface PanelSlotsProps {
  panel: PanelState;
  /** The content for a view, built by `RightRail` — see its note on why. */
  renderView: (view: ViewId) => React.ReactNode;
  counts: Partial<Record<ViewId, number | null>>;
  onFocusSlot: (index: SlotIndex) => void;
  onCloseSlot: (index: SlotIndex) => void;
  onToggleSplit: () => void;
  onRatioChange: (ratio: number) => void;
  onRatioReset: () => void;
}

/** The divider's own height, and the drag target. */
const DIVIDER_H = 7;

/**
 * The panel body: one or two slots, and the divider between them.
 *
 * The slot the next rail click will fill is the one with the ring — but only in
 * split mode. With a single slot there is nothing to disambiguate, so drawing a
 * ring there would be decoration that looks like state.
 */
export default function PanelSlots({
  panel,
  renderView,
  counts,
  onFocusSlot,
  onCloseSlot,
  onToggleSplit,
  onRatioChange,
  onRatioReset,
}: PanelSlotsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  /**
   * The ratio being dragged, before it is committed.
   *
   * Local rather than dispatched per pointer move, for the reason
   * `LayoutModeContext` gives for keeping the panel widths out of Redux: a drag
   * fires per frame, and a store round-trip per frame re-renders every
   * subscriber sixty times a second for a number only this component reads.
   * The store hears once, on release — which is also the only point the
   * persistence middleware needs to see.
   */
  const [dragRatio, setDragRatio] = useState<number | null>(null);

  const split = panel.slots.length === 2;
  const top = viewAt(panel, 0);
  const bottom = viewAt(panel, 1);
  const mode = sizingMode(panel, preferredHeightOf);
  const ratio = dragRatio ?? panel.ratio;
  // Extracted so the drag effect's dependency is a plain boolean: the effect
  // reads the ratio only through the setter, and depending on the number itself
  // would tear down and rebind the listeners on every pointer frame.
  const dragging = dragRatio !== null;

  const onDividerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragRatio(panel.ratio);
  }, [panel.ratio]);

  useEffect(() => {
    if (!dragging) return;
    const el = containerRef.current;
    if (!el) return;

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      if (rect.height <= 0) return;
      setDragRatio(clampRatio((e.clientY - rect.top) / rect.height));
    };
    const onUp = () => {
      // Read through the setter so the commit uses the last frame's value
      // rather than the one this effect closed over.
      setDragRatio((current) => {
        if (current !== null) onRatioChange(current);
        return null;
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, onRatioChange]);

  if (!top) return null;

  const slotSx = (index: SlotIndex) => {
    const focused = split && panel.focused === index;
    const isContent = mode === (index === 0 ? "content-top" : "content-bottom");

    return {
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
      position: "relative" as const,
      // `content` slots take exactly the height they need, capped so a long
      // property list cannot swallow the panel; everything else divides the
      // remainder by the ratio.
      ...(isContent
        ? { flex: "0 0 auto", maxHeight: `${CONTENT_SLOT_MAX_SHARE * 100}%` }
        : mode === "ratio"
        ? { flexBasis: 0, flexGrow: index === 0 ? ratio : 1 - ratio }
        : { flex: "1 1 0" }),
      // The ring is the answer to "which slot does my next click fill". Inset,
      // so it does not push the slot against its neighbour, and only ever drawn
      // in split mode.
      boxShadow: focused
        ? (theme: Theme) => `inset 0 0 0 2px ${theme.palette.accent.main}`
        : "none",
      transition: !dragging
        ? `box-shadow ${MOTION.fast}ms`
        : "none",
    };
  };

  const renderSlot = (index: SlotIndex, view: ViewId | null) => (
    <Box
      key={index}
      role="region"
      aria-labelledby={view ? `rail-slot-${index}-title` : undefined}
      aria-label={view ? undefined : "Empty panel slot"}
      // Any interaction inside a slot is a statement about which one you are
      // working in. Capture, so a click on a button deep in the content still
      // moves focus before the button acts.
      onMouseDownCapture={() => {
        if (split && panel.focused !== index) onFocusSlot(index);
      }}
      sx={slotSx(index)}
    >
      {view
        ? (
          <>
            <SlotHeader
              view={view}
              index={index}
              focused={!split || panel.focused === index}
              split={split}
              count={counts[view] ?? null}
              onSplit={onToggleSplit}
              onClose={() => onCloseSlot(index)}
            />
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
                px: 1.25,
                py: 1,
                bgcolor: "background.default",
              }}
            >
              {renderView(view)}
            </Box>
          </>
        )
        : (
          // The placeholder a split opens. It says what to do rather than
          // apologising for being empty — it exists for exactly one click.
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              px: 2,
              bgcolor: "background.default",
            }}
          >
            <Typography variant="caption" color="text.disabled">
              Pick a view from the rail to fill this slot
            </Typography>
          </Box>
        )}
    </Box>
  );

  return (
    <Box
      ref={containerRef}
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        // While dragging, the pointer is over whatever is under the divider;
        // without this the text in both slots selects as it moves.
        userSelect: dragging ? "none" : undefined,
      }}
    >
      {renderSlot(0, top)}

      {split && (
        <Box
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize panel slots"
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={20}
          aria-valuemax={80}
          tabIndex={0}
          onPointerDown={onDividerDown}
          onDoubleClick={onRatioReset}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onRatioChange(panel.ratio - 0.05);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              onRatioChange(panel.ratio + 0.05);
            }
          }}
          sx={{
            height: DIVIDER_H,
            flexShrink: 0,
            cursor: "row-resize",
            position: "relative",
            bgcolor: "divider",
            // The visible rule is 1px; the rest of the height is target.
            backgroundClip: "content-box",
            borderTop: `${(DIVIDER_H - 1) / 2}px solid`,
            borderBottom: `${(DIVIDER_H - 1) / 2}px solid`,
            borderColor: "background.panel",
            "&:hover, &:focus-visible": { bgcolor: "accent.main" },
            "&:focus-visible": { outline: "none" },
            transition: `background-color ${MOTION.fast}ms`,
          }}
        />
      )}

      {split && renderSlot(1, bottom)}
    </Box>
  );
}
