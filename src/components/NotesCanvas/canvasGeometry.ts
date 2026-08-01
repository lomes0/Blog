/**
 * Board geometry in unscaled ("virtual") units.
 *
 * One copy, read by both the selection code and `CanvasNode/utils.ts`, so a
 * board's floor and its growth margin cannot drift apart.
 */

export const VIRTUAL_CANVAS_WIDTH = 1920;
export const VIRTUAL_CANVAS_HEIGHT = 1080;

/**
 * Room kept beyond the furthest note that already lies outside the frame, so
 * `bounds="parent"` doesn't trap it where it is.
 *
 * This was 800 — a figure that belonged to the full-screen board, whose grid is
 * fixed to the viewport and so looks infinite. On a board sized by a document
 * column it is a bug: narrow the column (split a pane, open the Copilot panel)
 * and a single note poking past the frame grew the board to ~1265px inside a
 * 298px column, which is ~800px of empty grid to scroll through with the note
 * itself cut off at the edge. One minimum note width is enough to drag a
 * stranded note back into view.
 */
export const CANVAS_GROW_MARGIN = 160;
