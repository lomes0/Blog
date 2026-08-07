"use client";
import { Box, Divider, Skeleton } from "@mui/material";
import { cancelContentGutters } from "@/components/Layout/contentInset";
import { PANE_PAD_X, TOOLBAR_H } from "./paneChrome";

/**
 * A pane's first paint, before its document has arrived.
 *
 * This exists because the editor route had no loading state of its own. Both
 * the chunk-download wait and the per-document fetch fell through to
 * `SplashScreen`, which is `position: fixed; inset: 0; z-index: 1000` — so a
 * *pane* loading blanked the entire application, sidebar and rails included,
 * behind a 192px logo. Twice per reload, on the way in and again per document.
 *
 * The rule this encodes: a splash is for a whole-app terminal state (Not Found,
 * Editor Error), never for something transient inside a pane.
 *
 * ## Why the heights are written out
 *
 * Like `shared/EditorSkeleton`, this is a layout stand-in rather than a
 * shimmer — the point is that the real editor mounts into the same geometry, so
 * nothing reflows at the swap. The numbers are not decorative: {@link
 * TOOLBAR_H} is `ToolbarPlugin`'s own box, and the title block mirrors
 * `DocumentHeader` (`pt: 2 / pb: 3`, an `h4` at `lineHeight: 1.1` with
 * `mb: 2`, then the rule).
 *
 * Those two are what a reader's eye is anchored to, so they are worth matching
 * exactly. The body lines below them are deliberately approximate: real content
 * never matches a stand-in, and pretending otherwise buys nothing.
 *
 * `shared/EditorSkeleton` is the sibling of this, not a substitute: it draws an
 * app-shell `AppBar` toolbar, which is where Playground puts its own.
 * The workspace gives every pane its own toolbar inside `PaneHeader`, so a pane
 * needs this shape instead.
 */

interface PaneSkeletonProps {
  /**
   * Whether this stands in for a pane inside a split. It decides which gutters
   * to cancel, exactly as `PaneHeader` does: split panes scroll inside
   * `PaneFrame`'s {@link PANE_PAD_X} box, unsplit the page's asymmetric
   * `CONTENT_PAD_X` gutters are the ones to undo.
   */
  isSplit?: boolean;
  /**
   * Draw the toolbar band.
   *
   * True where this stands in for a whole pane and no `PaneHeader` exists yet —
   * the chunk-download wait, and the deep-link seam resolving a handle. False
   * inside `EditorTabPanel`, where `PaneHeader` is already mounted above and
   * reserving the band itself; drawing a second one there would show two.
   */
  withToolbar?: boolean;
  /**
   * Body lines to draw. The default fills a typical viewport; pass fewer for a
   * short pane so the stand-in does not imply more content than may arrive.
   */
  lines?: number;
}

/** Varied widths, so the block reads as text rather than as a loading bar. */
const LINE_WIDTHS = ["100%", "97%", "88%", "100%", "72%", "94%", "100%", "81%"];

const PaneSkeleton: React.FC<PaneSkeletonProps> = ({
  isSplit = false,
  withToolbar = false,
  lines = 8,
}) => (
  <Box
    // Inert scenery. Announcing eight skeleton bars to a screen reader is
    // noise — the live region that matters is the editor that replaces this.
    aria-hidden
    sx={{ display: "flex", flexDirection: "column", minHeight: "100%" }}
  >
    {
      /* Stands in for the toolbar that portals into `PaneHeader`. Sticky and
        `zIndex: 3` to match it, so the swap does not change stacking either. */
    }
    {withToolbar && (
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 3,
          flexShrink: 0,
          height: TOOLBAR_H,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
          bgcolor: "background.default",
          borderBottom: 1,
          borderColor: "divider",
          ...(isSplit ? { mx: -PANE_PAD_X } : cancelContentGutters),
        }}
      >
        {[64, 34, 34, 34, 88, 34, 34].map((w, i) => (
          <Skeleton
            key={i}
            variant="rounded"
            width={w}
            height={34}
            sx={{ borderRadius: 1, flexShrink: 0 }}
          />
        ))}
      </Box>
    )}

    {/* Stands in for `DocumentHeader`. */}
    <Box sx={{ pt: 2, pb: 3 }}>
      <Skeleton
        variant="text"
        width="55%"
        sx={{ typography: "h4", lineHeight: 1.1, mb: 2 }}
      />
      <Divider />
    </Box>

    {Array.from({ length: lines }, (_, i) => (
      <Skeleton
        key={i}
        variant="text"
        width={LINE_WIDTHS[i % LINE_WIDTHS.length]}
        sx={{ typography: "body1" }}
      />
    ))}
  </Box>
);

export default PaneSkeleton;
