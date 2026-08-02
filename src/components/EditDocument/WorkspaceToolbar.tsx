"use client";
import { Box } from "@mui/material";
import { ToolbarSlotTarget } from "@/contexts/ToolbarSlotContext";
import { cancelContentGutters } from "@/components/Layout/contentInset";
import { TOOLBAR_H } from "./paneChrome";

interface WorkspaceToolbarProps {
  /**
   * Whether a toolbar is on its way into the slot — i.e. the focused pane is
   * being written in. Only decides whether this band draws its own rule: with a
   * toolbar in it, the toolbar's own `borderBottom` is the rule, and two would
   * read as a double line.
   */
  hasToolbar: boolean;
  /**
   * Hold {@link TOOLBAR_H} open. True while *any* pane is writable, not just
   * the focused one, so moving focus between a `write` pane and a `read` one
   * does not shunt both documents up and down by 43px under the pointer.
   */
  reserve: boolean;
}

/**
 * The split view's one formatting toolbar, above both panes.
 *
 * Each pane used to host its own inside `PaneHeader` — two live toolbars, one
 * per `ToolbarSlotProvider`. That made the unfocused half of a split editable
 * without first clicking into it, but it also meant two rows of near-identical
 * controls stacked at different heights in a view whose whole point is to show
 * two documents at once, and the answer to "which one does this button act on"
 * was positional.
 *
 * One band, fed by the focused pane, restores the single answer: the toolbar
 * acts on whatever you are typing in. `EditorTabPanel` is where that claim is
 * made — split, the portal is gated on the pane being focused rather than
 * merely on the tab being visible.
 *
 * Unsplit is untouched: there is only one pane, its header holds the toolbar as
 * it always has, and this component does not render.
 */
const WorkspaceToolbar: React.FC<WorkspaceToolbarProps> = ({
  hasToolbar,
  reserve,
}) => (
  <Box
    sx={{
      flexShrink: 0,
      minHeight: reserve ? `${TOOLBAR_H}px` : 0,
      bgcolor: "background.default",
      // Full-bleed across the content column: this sits inside the padded
      // container, and chrome meets its edges.
      ...cancelContentGutters,
      // Only when the band is standing empty — a read-mode pane has the focus
      // and there is no toolbar to draw its own.
      ...(reserve && !hasToolbar && {
        borderBottom: 1,
        borderColor: "divider",
      }),
    }}
  >
    <ToolbarSlotTarget />
  </Box>
);

export default WorkspaceToolbar;
