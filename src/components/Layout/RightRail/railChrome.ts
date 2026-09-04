/**
 * Metrics the right rail's views share.
 *
 * Same test as `src/theme/tokens.ts`: a literal that appears in more than one
 * file is a default that was never set — these appeared in three, with three
 * different answers. What the theme already owns is imported rather than
 * restated, which is the whole point of the file existing at all.
 */

import { TREE_ROW_RADIUS } from "@/theme/treeRow";

/**
 * A rail chip's height.
 *
 * The three views ran at 16 (`ProposalsSection`'s origin chip and
 * `RevisionsSection`'s Cloud/Local mark), 18 (`PropertiesSection`'s status) and
 * 20 (the revisions filter pair) — one element, three heights, visible in a
 * column 230px wide where two of them can sit four pixels apart.
 *
 * 20 rather than the middle value: `micro` is 11px on a 1.5 line box (16.5px),
 * so 18 leaves under a pixel of padding, and the filter pair is a *control* —
 * the one of the three you click, and the one that should not be the smallest.
 */
export const RAIL_CHIP_H = 20;

/**
 * The chip itself. Height, type scale and the label's own padding, which two of
 * the three call sites set and the third did not — so the status chip was both
 * shorter and roomier than its neighbours.
 *
 * Radius comes from the `MuiChip` override (DESIGN.md §5, 6px) and is
 * deliberately not restated here.
 */
export const railChipSx = {
  height: RAIL_CHIP_H,
  typography: "micro",
  "& .MuiChip-label": { px: 0.5 },
} as const;

/**
 * The card a rail row sits in — a proposal, an agent-created post, a rename, a
 * revision.
 *
 * Written twice, identically apart from the flex axis: `ProposalsSection`'s
 * `rowSx` and `RevisionsSection`'s inline row. Both wrote `borderRadius: 1`,
 * which on the ×4 `sx` scale is **4px** — DESIGN.md §5's *image* radius, not a
 * row's. §17.4 puts a list row at `1.5` (6px), which is what `TREE_ROW_RADIUS`
 * has always said; this is its second user.
 *
 * The axis stays with the caller: a revision is a single line of avatar, name
 * and mark, and a proposal is a stack ending in its buttons.
 */
export const railRowSx = {
  display: "flex",
  border: "1px solid",
  borderColor: "divider",
  borderRadius: TREE_ROW_RADIUS,
  p: 0.75,
  bgcolor: "background.paper",
} as const;
