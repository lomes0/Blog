/**
 * Board geometry in unscaled ("virtual") units.
 *
 * One copy for both boards — the standalone `/notes` canvas and the `CanvasNode`
 * canvas embedded in a document — so they lay out identically. These were three
 * separate literal copies (`NotesCanvas/index.tsx`, `PasteButton.tsx`,
 * `CanvasNode/utils.ts`) until the selection code needed a fourth.
 */

export const VIRTUAL_CANVAS_WIDTH = 1920;
export const VIRTUAL_CANVAS_HEIGHT = 1080;

/**
 * Room kept beyond the furthest note so the board can always grow as notes are
 * dragged toward its edges. The grid background is fixed to the viewport so it
 * looks infinite; without growing the board, drags clamp at the virtual edge
 * even though the grid still appears beyond it.
 */
export const CANVAS_GROW_MARGIN = 800;
