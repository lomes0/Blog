/**
 * The home pane's one shared measurement: the composer and the recents list are
 * the same column, so the width lives in one place rather than being written
 * twice and drifting.
 *
 * Fluid below the fixed width — the pane sits between two rails whose widths
 * the user drags, so it cannot assume the viewport.
 */
export const HOME_COLUMN_W = "min(660px, 100%)";
