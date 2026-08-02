"use client";
import * as React from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { FileText, Maximize2, Minimize2, X } from "lucide-react";
import { MOTION } from "@/theme/tokens";
import { ICON_SIZE } from "@/theme/icons";
import { CHROME_RING } from "@/theme/treeRow";
import { cancelContentGutters } from "@/components/Layout/contentInset";
import { PANE_PAD_X, PANE_STRIP_H, TOOLBAR_H } from "./paneChrome";

interface PaneHeaderProps {
  /** Two panes on screen: the header grows a focus accent along its top edge. */
  isSplit: boolean;
  isFocused: boolean;
  /** The document this pane is showing — the strip's label. */
  title?: string;
  /** Whether this pane is the one currently filling the row. */
  isMaximized?: boolean;
  /** ⤢ — hand the row to this pane, or give it back. Split only. */
  onToggleMaximize?: () => void;
  /** ✕ — close this pane, leaving the other. Split only. */
  onClose?: () => void;
  /**
   * Hold {@link TOOLBAR_H} open for a toolbar that has not portalled in yet.
   *
   * The toolbar arrives with the editor, which is one document fetch after this
   * header exists — so without the reservation the document appears and is
   * immediately shoved 43px down its own scroller by chrome landing above it.
   * True in write mode, where a toolbar is coming; false in read mode, where
   * none is and the document should start against nothing.
   *
   * Costs nothing once the toolbar is in: it is this tall anyway, so the
   * `minHeight` stops binding.
   */
  reserveToolbar?: boolean;
  /** The toolbar slot this pane's editors portal into. */
  children?: React.ReactNode;
}

/**
 * Class the pane's hover rule reveals its actions through — see `PaneFrame`,
 * which owns the `:hover` because the pointer is over the *pane*, not over this
 * 32px strip.
 */
export const PANE_ACTION_CLASS = "pane-action-btn";

/**
 * At rest these are invisible but still laid out — `opacity`, never `display`,
 * so the strip does not reflow under the pointer as it arrives. Keyboard focus
 * shows them without a hover (§9), which is the whole reason they are real
 * buttons in the flow rather than something drawn on hover.
 */
const paneActionSx = {
  p: 0.5,
  flexShrink: 0,
  color: "text.secondary",
  opacity: 0,
  transition: `opacity ${MOTION.fast}ms, color ${MOTION.fast}ms`,
  "&:hover": { opacity: 1 },
  "&:focus-visible": { opacity: 1, ...CHROME_RING },
} as const;

/**
 * What stays pinned above a pane's document: the strip that names it, the
 * formatting toolbar while this is the only pane, and — in a split — the accent
 * marking which pane is focused.
 *
 * The strip came back (3 Aug 2026) after a spell with no pane chrome at all. The
 * argument for removing it was that the document's own title already says what a
 * pane holds; what that missed is that a title scrolls away, and once it has,
 * two panes of prose are two columns with nothing saying where one ends. It also
 * left the two things you do *to* a pane — fill the row with it, close it —
 * reachable only through ⌘K. They are hover-revealed here (DESIGN.md §9: the
 * strip is focusable chrome, so they are keyboard-reachable too), so the resting
 * state is still a name and nothing else.
 *
 * The sub-document tabs are not here — they moved into the document itself
 * (`DocumentTabs`, under the title), because they are a fact about the post
 * rather than about the viewport.
 *
 * The toolbar was per pane for a while, so that the unfocused half of a split
 * stayed editable without a click. Two rows of the same controls at two heights
 * turned out to be worse than the click: a split now has one toolbar above both
 * panes (`WorkspaceToolbar`), fed by whichever pane has the focus. Unsplit
 * there is nothing to disambiguate, so the toolbar stays here, where it is
 * already the top of the only scroller.
 *
 * `position: sticky` keeps it pinned now that it is not window chrome. Unsplit,
 * the page's padded container is the scroller and the header cancels its
 * gutters to sit flush with the pane; split, each pane scrolls itself and the
 * same rule holds against `PaneFrame`'s {@link PANE_PAD_X} box.
 */
const PaneHeader: React.FC<PaneHeaderProps> = ({
  isSplit,
  isFocused,
  title,
  isMaximized = false,
  onToggleMaximize,
  onClose,
  reserveToolbar = false,
  children,
}) => (
  <Box
    sx={{
      position: "sticky",
      top: 0,
      // Above the document, below the editor's floating toolbars.
      zIndex: 3,
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      bgcolor: "background.default",
      // Cancel the scroller's gutters so the header spans the pane it belongs
      // to. Split panes scroll inside `PaneFrame`'s `PANE_PAD_X` box; unsplit,
      // the page's asymmetric content gutters are the ones to undo.
      ...(isSplit ? { mx: -PANE_PAD_X } : cancelContentGutters),
      // DESIGN.md §17.3 — the focused-pane accent, on the top edge. Only with a
      // second pane to distinguish it from.
      ...(isSplit && {
        "&::before": {
          content: '""',
          position: "absolute",
          insetInline: 0,
          top: 0,
          height: 2,
          bgcolor: isFocused ? "primary.main" : "transparent",
          transition: `background-color ${MOTION.fast}ms`,
          zIndex: 1,
        },
      }),
    }}
  >
    {
      /* The strip is split-only. With one pane the top bar already names the
        document, ✕ would close the thing you are looking at, and ⤢ has nothing
        to maximize over — three reasons that all say the same thing: a lone
        pane is not a pane you address. */
    }
    {isSplit && (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          height: PANE_STRIP_H,
          flexShrink: 0,
          // Half the pane's own padding: the strip is chrome and sits closer to
          // the pane edge than the prose does.
          px: PANE_PAD_X / 2,
        }}
      >
        <Box
          component="span"
          sx={{ display: "flex", color: "text.secondary", opacity: 0.7 }}
        >
          <FileText size={ICON_SIZE.inline} />
        </Box>
        <Typography
          noWrap
          sx={{
            typography: "dense",
            color: "text.secondary",
            // Reads as a label for the pane, not as the document's title —
            // that is the h4 below it, and two headings would compete.
            fontWeight: isFocused ? 600 : 400,
            flex: 1,
            minWidth: 0,
          }}
        >
          {title ?? "Untitled"}
        </Typography>
        <Tooltip title={isMaximized ? "Restore split" : "Maximize pane"}>
          <IconButton
            className={PANE_ACTION_CLASS}
            size="small"
            aria-label={isMaximized ? "Restore split" : "Maximize pane"}
            aria-pressed={isMaximized}
            onClick={onToggleMaximize}
            sx={paneActionSx}
          >
            {isMaximized
              ? <Minimize2 size={ICON_SIZE.inline} />
              : <Maximize2 size={ICON_SIZE.inline} />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Close pane">
          <IconButton
            className={PANE_ACTION_CLASS}
            size="small"
            aria-label="Close pane"
            onClick={onClose}
            sx={{
              ...paneActionSx,
              "&:hover": { color: "error.main", opacity: 1 },
            }}
          >
            <X size={ICON_SIZE.inline} />
          </IconButton>
        </Tooltip>
      </Box>
    )}
    {
      /* The pane's formatting toolbar portals in here. It draws its own bottom
        rule, which is why neither this block nor the strip above carries one —
        in read mode there is no toolbar and no rule, and the document should
        start against nothing. */
    }
    <Box sx={{ minHeight: reserveToolbar ? `${TOOLBAR_H}px` : 0 }}>
      {children}
    </Box>
  </Box>
);

export default PaneHeader;
