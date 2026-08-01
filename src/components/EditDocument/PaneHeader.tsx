"use client";
import * as React from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { X } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import { MOTION } from "@/theme/tokens";
import { CONTENT_PAD_X } from "@/components/Layout/contentInset";
import { TOOLBAR_H } from "./paneChrome";

interface PaneHeaderProps {
  /** The active document's name — what this pane is showing. Split view only. */
  title: string;
  /** Two panes on screen: the header grows a focus accent and a close-pane ✕. */
  isSplit: boolean;
  isFocused: boolean;
  onClosePane: () => void;
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
 * split — the strip that says which pane this is.
 *
 * The sub-document tabs were here for a day and have moved into the document
 * itself (`DocumentTabs`, under the title). What is left is the chrome that is
 * genuinely about the *pane* rather than the post: the toolbar, whose controls
 * act on whichever pane you are typing in, and the focused-pane accent. Both
 * are per pane rather than per window — that is what makes the two halves of a
 * split independently editable, and it is the whole reason this component
 * exists instead of a slot in the app shell.
 *
 * `position: sticky` keeps it pinned now that it is not window chrome. Unsplit,
 * the page's padded container is the scroller and the header cancels its
 * gutters to sit flush with the pane; split, each pane scrolls itself and the
 * same rule holds against `PaneFrame`'s box.
 */
const PaneHeader: React.FC<PaneHeaderProps> = ({
  title,
  isSplit,
  isFocused,
  onClosePane,
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
    {isSplit && (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          py: 0.25,
          minHeight: 28,
        }}
      >
        <Typography
          noWrap
          variant="dense"
          sx={{
            flex: 1,
            minWidth: 0,
            fontWeight: isFocused ? 600 : 400,
            color: isFocused ? "text.primary" : "text.secondary",
          }}
        >
          {title}
        </Typography>
        <Tooltip title="Close pane">
          <IconButton
            size="small"
            aria-label={`Close ${title} pane`}
            onClick={onClosePane}
            sx={{
              flexShrink: 0,
              p: 0.25,
              color: "text.secondary",
              "&:hover": { color: "text.primary" },
            }}
          >
            <X size={ICON_SIZE.micro} />
          </IconButton>
        </Tooltip>
      </Box>
    )}
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
