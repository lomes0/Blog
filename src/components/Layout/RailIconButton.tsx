"use client";
import React from "react";
import { Box, Tooltip } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import RouterLink from "next/link";
import { FOCUS_RING, MOTION } from "@/theme/tokens";

/**
 * Row pitch. A {@link RAIL_CHIP_SIZE} chip in 42px leaves the handoff's 4px
 * chip-to-chip gap, and it is the pitch *both* rails now run on — the right
 * strip's view icons were 38 and its bottom actions ~34, so a 54px column held
 * three rhythms.
 */
export const RAIL_ITEM_H = 42;

/** The chip that carries the hover/active tint. */
export const RAIL_CHIP_SIZE = 38;

interface RailIconButtonProps {
  /** Tooltip text, and the accessible name unless `ariaLabel` overrides it. */
  label: string;
  /**
   * Accessible name, where it says more than the tooltip — a rail icon whose
   * badge carries a count folds the count into its name, because a screen
   * reader either reads the badge as a bare digit or skips it.
   */
  ariaLabel?: string;
  icon: React.ReactNode;
  /** Showing / selected. Omit entirely on a plain action (⌘K, "new note"). */
  active?: boolean;
  /**
   * Nothing to show behind this icon — dims it without disabling it. "Nothing
   * here" is a fact worth being able to go and confirm.
   */
  dim?: boolean;
  /**
   * Draw the active accent bar (DESIGN.md §17.3). Off for an item that is not a
   * toggle — the brand chip, a one-shot action.
   */
  showBar?: boolean;
  /**
   * Which screen edge the bar hugs. The two rails mirror each other: the left
   * rail's bar is on the window's left edge, the right strip's on its right.
   */
  side?: "left" | "right";
  /** Tooltip side — away from the rail, so it does not cover its neighbours. */
  placement?: "left" | "right";
  /** Render as a link instead of a button. */
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  /**
   * This rail is a tablist rather than a toolbar: emits `role="tab"` +
   * `aria-selected` in place of `aria-pressed`. The owning rail supplies the
   * `role="tablist"` container and the roving `tabIndex`.
   */
  tab?: boolean;
  tabIndex?: number;
  buttonRef?: (el: HTMLButtonElement | null) => void;
  /** Overlaid on the chip — the count badge. Positioned against the chip. */
  children?: React.ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * One rail icon: a centred rounded chip carrying the hover/active tint, plus an
 * accent bar pinned to the rail's outer edge when active.
 *
 * **There were three of these.** The activity rail drew a 38px chip at an 11px
 * radius with a bar; the right rail's view switcher drew a 34px chip at 10px
 * with no bar; and the same strip's Copilot / palette / settings row was a plain
 * MUI `IconButton` — circular, rippling, and saying "active" with nothing but
 * `color="primary"`. Two of those sat in the *same* 54px column, four pixels
 * apart. DESIGN.md §17.3 asks for one interaction vocabulary across chrome, and
 * a rail button is the case that had drifted furthest from it.
 *
 * The chip radius is §5's canonical `2` (8px); the 10px and 11px it replaces
 * were both off-scale, and off it in different directions.
 */
const RailIconButton: React.FC<RailIconButtonProps> = ({
  label,
  ariaLabel,
  icon,
  active,
  dim,
  showBar,
  side = "left",
  placement = "right",
  href,
  onClick,
  onKeyDown,
  tab,
  tabIndex,
  buttonRef,
  children,
  sx,
}) => {
  const isLink = href !== undefined;

  const element = isLink
    ? ({ component: RouterLink, href } as const)
    : ({ component: "button", type: "button", ref: buttonRef } as const);

  // `aria-pressed` belongs to a toggle only. A link is not one, a tab says
  // `aria-selected` instead, and a one-shot action has no pressed state to
  // report — announcing "not pressed" on ⌘K is noise, not information.
  const state = tab
    ? { role: "tab", "aria-selected": !!active }
    : !isLink && active !== undefined
    ? { "aria-pressed": active }
    : {};

  return (
    <Tooltip title={label} placement={placement}>
      <Box
        {...element}
        {...state}
        aria-label={ariaLabel ?? label}
        tabIndex={tabIndex}
        onClick={onClick}
        onKeyDown={onKeyDown}
        sx={[
          {
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: RAIL_ITEM_H,
            p: 0,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            flexShrink: 0,
            // Hover only lifts an inactive chip — an active one keeps its tint,
            // or the pointer would appear to deselect what it is over.
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
            // The bar hugs the rail's edge, not the chip's, so it reads as a
            // mark on the rail rather than a border on the button.
            ...(showBar && {
              "&::before": {
                content: '""',
                position: "absolute",
                [side]: 0,
                top: 12,
                bottom: 12,
                width: 3,
                borderRadius: side === "left" ? "0 3px 3px 0" : "3px 0 0 3px",
                bgcolor: "accent.main",
                opacity: active ? 1 : 0,
                transition: `opacity ${MOTION.fast}ms`,
              },
            }),
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        <Box
          className="rail-chip"
          sx={{
            position: "relative",
            width: RAIL_CHIP_SIZE,
            height: RAIL_CHIP_SIZE,
            // §5's canonical button/panel radius.
            borderRadius: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            // Three states in priority order: showing, empty for this document,
            // ordinary. An active icon is never dimmed — you are looking at it.
            color: active
              ? "accent.main"
              : dim
              ? "text.disabled"
              : "text.secondary",
            bgcolor: active ? "accent.tint" : "transparent",
            transition:
              `color ${MOTION.fast}ms, background-color ${MOTION.fast}ms`,
          }}
        >
          {icon}
          {children}
        </Box>
      </Box>
    </Tooltip>
  );
};

export default RailIconButton;
