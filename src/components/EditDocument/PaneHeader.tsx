"use client";
import * as React from "react";
import { Box } from "@mui/material";
import { MOTION } from "@/theme/tokens";
import { cancelContentGutters } from "@/components/Layout/contentInset";
import { TOOLBAR_H } from "./paneChrome";

interface PaneHeaderProps {
  /** Two panes on screen: the header grows a focus accent along its top edge. */
  isSplit: boolean;
  isFocused: boolean;
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
 * What stays pinned above a pane's document: the formatting toolbar while this
 * is the only pane, and — in a split — the accent marking which pane is
 * focused.
 *
 * The sub-document tabs were here for a day and have moved into the document
 * itself (`DocumentTabs`, under the title); the name-and-✕ strip that named the
 * pane is gone too — the document's own title already says what a pane holds,
 * and closing one is the `pane.close` command.
 *
 * The toolbar was per pane for a while, so that the unfocused half of a split
 * stayed editable without a click. Two rows of the same controls at two heights
 * turned out to be worse than the click: a split now has one toolbar above both
 * panes (`WorkspaceToolbar`), fed by whichever pane has the focus. Unsplit
 * there is nothing to disambiguate, so the toolbar stays here, where it is
 * already the top of the only scroller — and the focused-pane accent is all
 * this header carries in a split.
 *
 * `position: sticky` keeps it pinned now that it is not window chrome. Unsplit,
 * the page's padded container is the scroller and the header cancels its
 * gutters to sit flush with the pane; split, each pane scrolls itself and the
 * same rule holds against `PaneFrame`'s box.
 */
const PaneHeader: React.FC<PaneHeaderProps> = ({
  isSplit,
  isFocused,
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
      // to. Split panes scroll inside `PaneFrame`'s `px: 1` box; unsplit, the
      // page's asymmetric content gutters are the ones to undo.
      ...(isSplit ? { mx: -1 } : cancelContentGutters),
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
      /* The pane's formatting toolbar portals in here. It draws its own bottom
        rule, which is why neither this block nor the row above carries one —
        in read mode there is no toolbar and no rule, and the document should
        start against nothing. */
    }
    <Box sx={{ minHeight: reserveToolbar ? `${TOOLBAR_H}px` : 0 }}>
      {children}
    </Box>
  </Box>
);

export default PaneHeader;
