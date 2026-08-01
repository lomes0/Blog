import {
  ADD_BTN_W,
  fitWindow,
  OVERFLOW_CHIP_W,
  TAB_GAP,
  TAB_MIN_W,
} from "../tabFit";

/** Every tab the same width, so the arithmetic in each case is legible. */
const even = (count: number, width = 100) => Array<number>(count).fill(width);

/**
 * Room for exactly `n` tabs of `width`, plus the trailing controls. The "+"
 * is unconditional — it follows the last tab — so it is in every figure here;
 * the overflow chip only shows when something is hidden.
 */
const roomFor = (n: number, width = 100, withChip = true) =>
  n * (width + TAB_GAP) + ADD_BTN_W + (withChip ? OVERFLOW_CHIP_W : 0);

describe("fitWindow", () => {
  it("shows every tab when they all fit", () => {
    expect(fitWindow(even(4), 1000, 0)).toEqual({ start: 0, end: 4 });
  });

  it("does not reserve the overflow chip when nothing overflows", () => {
    // Exactly the tabs' own width: the chip is not showing, so it must not be
    // subtracted — doing so would hide a tab to make room for a control that
    // only exists because a tab is hidden.
    const avail = roomFor(3, 100, false);
    expect(fitWindow(even(3), avail, 0)).toEqual({ start: 0, end: 3 });
  });

  it("always reserves the new-tab button, overflow or not", () => {
    // The "+" sits after the last tab rather than at the end of the line, so
    // it is in the run's way even when every tab fits. Exactly three tabs'
    // worth of room is therefore room for two and the button.
    const avail = 3 * (100 + TAB_GAP);
    expect(fitWindow(even(3), avail, 0).end).toBeLessThan(3);
    expect(fitWindow(even(3), avail + ADD_BTN_W, 0)).toEqual({
      start: 0,
      end: 3,
    });
  });

  it("reserves room for the chip once anything overflows", () => {
    // Six tabs, room for three plus the chip.
    expect(fitWindow(even(6), roomFor(3), 0)).toEqual({ start: 0, end: 3 });
  });

  it("keeps the window anchored at the start while the active tab fits", () => {
    expect(fitWindow(even(6), roomFor(3), 2)).toEqual({ start: 0, end: 3 });
  });

  it("rebuilds the window backwards when the active tab is past the fold", () => {
    // Active is index 5 of 6 with room for three: the window ends on it.
    expect(fitWindow(even(6), roomFor(3), 5)).toEqual({ start: 3, end: 6 });
  });

  it("never rearranges tabs — the window is contiguous and in order", () => {
    const { start, end } = fitWindow(even(9), roomFor(4), 7);
    expect(end - start).toBe(4);
    expect(end).toBe(8); // ends on the active tab
  });

  it("keeps one tab visible when a single tab is wider than the row", () => {
    // A long label in a narrow pane: clipped by the strip, not banished to the
    // menu — an empty row would leave the document unlabelled.
    expect(fitWindow([400], 120, 0)).toEqual({ start: 0, end: 1 });
  });

  it("treats an unmeasured row as everything-fits", () => {
    // First paint, before layout: hiding tabs on a width of 0 would flash an
    // overflow menu holding every tab.
    expect(fitWindow(even(5), 0, 0)).toEqual({ start: 0, end: 5 });
    expect(fitWindow([], 500, -1)).toEqual({ start: 0, end: 0 });
  });

  it("handles a pane with no active tab", () => {
    expect(fitWindow(even(6), roomFor(3), -1)).toEqual({ start: 0, end: 3 });
  });

  it("fits narrow tabs by their own widths, not a flat column", () => {
    // The old strip gave every tab `width: 95`. Mixed widths are the point of
    // the change: three short labels fit where two wide ones did.
    const widths = [TAB_MIN_W, TAB_MIN_W, TAB_MIN_W, 160];
    const avail = 3 * (TAB_MIN_W + TAB_GAP) + OVERFLOW_CHIP_W + ADD_BTN_W;
    expect(fitWindow(widths, avail, 0)).toEqual({ start: 0, end: 3 });
  });
});
