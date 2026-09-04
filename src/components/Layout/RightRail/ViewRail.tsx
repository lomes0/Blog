"use client";
import React, { useRef } from "react";
import { Box, Tooltip } from "@mui/material";
import { ICON_SIZE } from "@/theme/icons";
import { FOCUS_RING, MOTION } from "@/theme/tokens";
import type { PanelView, ViewId } from "./panelState";
import { VIEW_IDS } from "./panelState";
import { railIconLabel, VIEWS } from "./views";
import type { ViewSignal } from "./useViewData";

interface ViewRailProps {
  /** The view on screen, or `null` when the panel is closed. */
  current: PanelView;
  signals: Record<ViewId, ViewSignal>;
  onSelect: (view: ViewId) => void;
}

/** Badges stop counting rather than growing a third digit. */
const badgeText = (count: number) => (count > 99 ? "99+" : String(count));

/**
 * The rail's view switcher.
 *
 * This is the part that has to make back what the stack gave away for free.
 * With every section visible at once you could see there were three agent
 * changes and no revisions without doing anything; with one view visible the
 * rail is the only thing that can still say so. Hence a badge per view that has
 * a count, and a dimmed icon for a view that is empty *for this document* —
 * dimmed rather than disabled, because "nothing here" is a fact worth being
 * able to go and confirm.
 *
 * A tablist rather than a row of buttons: the icons are a single-choice control
 * over one region, arrow keys move between them, and `aria-selected` says which
 * one is showing.
 */
export default function ViewRail({ current, signals, onSelect }: ViewRailProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  /**
   * Which icon is in the tab order.
   *
   * Roving tabindex: exactly one stop for the whole group, so Tab passes the
   * rail rather than walking through five buttons. The view on screen owns it,
   * or the first icon when the panel is closed.
   */
  const tabStop = current ?? VIEW_IDS[0];

  const onKeyDown = (e: React.KeyboardEvent, view: ViewId) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const index = VIEW_IDS.indexOf(view);
    const next = VIEW_IDS[(index + step + VIEW_IDS.length) % VIEW_IDS.length];
    refs.current[next]?.focus();
  };

  return (
    <Box
      role="tablist"
      aria-orientation="vertical"
      aria-label="Document information views"
      sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      {VIEW_IDS.map((view) => {
        const { title, icon: Icon } = VIEWS[view];
        const { count, empty } = signals[view];
        const active = current === view;
        const showBadge = count !== null && count > 0;

        return (
          <Tooltip key={view} title={title} placement="left">
            <Box
              component="button"
              type="button"
              role="tab"
              ref={(el: HTMLButtonElement | null) => {
                refs.current[view] = el;
              }}
              aria-selected={active}
              aria-label={railIconLabel(view, count)}
              tabIndex={view === tabStop ? 0 : -1}
              onKeyDown={(e: React.KeyboardEvent) => onKeyDown(e, view)}
              onClick={() => onSelect(view)}
              sx={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 42,
                height: 38,
                p: 0,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                "&:hover .view-chip": {
                  bgcolor: active ? "accent.tint" : "action.hover",
                },
                "&:focus-visible": {
                  outline: "none",
                  "& .view-chip": { boxShadow: FOCUS_RING.chrome },
                },
              }}
            >
              <Box
                className="view-chip"
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: active ? "accent.tint" : "transparent",
                  // Three states, in priority order: showing, empty for this
                  // document, ordinary. An active icon is never dimmed — you
                  // are looking at it.
                  color: active
                    ? "accent.main"
                    : empty
                    ? "text.disabled"
                    : "text.secondary",
                  transition:
                    `color ${MOTION.fast}ms, background-color ${MOTION.fast}ms`,
                }}
              >
                <Icon size={ICON_SIZE.dense} />
              </Box>

              {
                /* Suppressed at zero rather than showing "0" — a badge is for
                  the exception, and five zeroes down the rail is noise that
                  makes the one real number harder to see. Marked `aria-hidden`
                  because the count is already in the button's own label. */
              }
              {showBadge && (
                <Box
                  component="span"
                  aria-hidden
                  sx={{
                    position: "absolute",
                    top: 1,
                    right: 1,
                    minWidth: 15,
                    height: 15,
                    px: 0.375,
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    typography: "micro",
                    fontWeight: 700,
                    lineHeight: 1,
                    color: active ? "accent.activeText" : "text.secondary",
                    bgcolor: active ? "accent.pillActiveBg" : "accent.pillBg",
                    // Against the rail, not the chip — it overhangs both.
                    border: "1px solid",
                    borderColor: "background.rail",
                  }}
                >
                  {badgeText(count)}
                </Box>
              )}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
