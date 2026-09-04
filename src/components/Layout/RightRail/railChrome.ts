/**
 * Metrics the right rail's views share.
 *
 * Import-free, so it stays readable next to DESIGN.md rather than next to a
 * component. Same test as `src/theme/tokens.ts`: a literal that appears in more
 * than one file is a default that was never set — these appeared in three, with
 * three different answers.
 */

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
