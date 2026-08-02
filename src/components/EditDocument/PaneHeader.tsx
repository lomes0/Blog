"use client";
import * as React from "react";
import { Box } from "@mui/material";
import { MOTION } from "@/theme/tokens";
import { CONTENT_PAD_X } from "@/components/Layout/contentInset";
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
 * What stays pinned above a pane's document: its formatting toolbar, and — in a
 * split — the accent marking which pane is focused.
 *
 * The sub-document tabs were here for a day and have moved into the document
 * itself (`DocumentTabs`, under the title); the name-and-✕ strip that named the
 * pane is gone too — the document's own title already says what a pane holds,
 * and closing one is the `pane.close` command. What is left is the chrome that
 * is genuinely about the *pane* rather than the post: the toolbar, whose
 * controls act on whichever pane you are typing in, and the focused-pane
 * accent. Both are per pane rather than per window — that is what makes the two
 * halves of a split independently editable, and it is the whole reason this
 * component exists instead of a slot in the app shell.
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
      // page's asymmetric content gutters (`CONTENT_PAD_X`) are the ones to
      // undo.
      ...(isSplit ? { mx: -1 } : {
        ml: {
          xs: -CONTENT_PAD_X.xs.left,
          sm: -CONTENT_PAD_X.sm.left,
          md: -CONTENT_PAD_X.md.left,
        },
        mr: {
          xs: -CONTENT_PAD_X.xs.right,
          sm: -CONTENT_PAD_X.sm.right,
          md: -CONTENT_PAD_X.md.right,
        },
      }),
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
