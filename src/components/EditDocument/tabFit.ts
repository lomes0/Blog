/**
 * How many pane tabs fit, and which ones.
 *
 * Import-free on purpose — the same rule `dragGeometry.ts` follows. The strip
 * that uses this needs a DOM to measure, but the decision it makes from those
 * measurements is arithmetic, and arithmetic should be testable without
 * mounting anything.
 */

/**
 * `TAB_MAX_W` is the ceiling a label ellipsises at; below it a tab is as wide as
 * its own text, where the strip used to give every one a flat `width: 95` —
 * which truncated "Introduction" and wasted half a tab on "Q3".
 *
 * `TAB_MIN_W` is the assumed width of a tab that has not been measured yet, so
 * the first pass errs toward showing fewer rather than overflowing the row.
 */
export const TAB_MIN_W = 72;
export const TAB_MAX_W = 168;

/**
 * Column gap between tabs, in px — the row applies this same constant as its
 * CSS `gap`, so the fit math cannot drift from the layout it is predicting.
 *
 * It is also the channel the separator rule sits in, centred, which is why it
 * is 8 and not the 4 the pills used: a hairline with 2px of air either side
 * reads as a crease between two tabs, not as a thin third tab.
 */
export const TAB_GAP = 8;

/** Width the trailing "»N" control needs, so the fit math can reserve it. */
export const OVERFLOW_CHIP_W = 44;

interface TabWindow {
  start: number;
  /** Exclusive, so `tabs.slice(start, end)` is the visible run. */
  end: number;
}

/**
 * Which slice of the tabs fits, given every tab's natural width.
 *
 * A contiguous window, not "the first N that fit": when the active tab sits
 * past the fold the window is rebuilt backwards from it, so switching to a tab
 * out of the overflow menu brings it on screen instead of activating something
 * the user cannot see. Order is never rearranged — this is a scroll position
 * expressed as a range, with a menu where the scrollbar used to be.
 *
 * `widths` are natural widths of every tab, in order; `avail` is the row's
 * content width. Both come from the DOM, which is why they arrive as numbers.
 */
export const fitWindow = (
  widths: number[],
  avail: number,
  activeIndex: number,
): TabWindow => {
  // No measurement yet (first paint, or a detached row): claim everything fits
  // rather than hiding tabs on a number that is not yet true.
  if (widths.length === 0 || avail <= 0) {
    return { start: 0, end: widths.length };
  }

  const total = widths.reduce((sum, w) => sum + w + TAB_GAP, 0);
  if (total <= avail) return { start: 0, end: widths.length };

  // Something will overflow, so the chip is showing and owns part of the row.
  const room = avail - OVERFLOW_CHIP_W;

  // Forward from the first tab.
  let used = 0;
  let end = 0;
  while (end < widths.length && used + widths[end] + TAB_GAP <= room) {
    used += widths[end] + TAB_GAP;
    end++;
  }
  if (activeIndex < 0 || activeIndex < end) {
    // At least one tab is always visible: a single tab wider than the row is
    // clipped by the strip rather than dropped into the menu, which would leave
    // the row empty and the document unlabelled.
    return { start: 0, end: Math.max(end, 1) };
  }

  // The active tab is past the fold: rebuild the window backwards from it.
  used = widths[activeIndex] + TAB_GAP;
  let start = activeIndex;
  while (start > 0 && used + widths[start - 1] + TAB_GAP <= room) {
    used += widths[start - 1] + TAB_GAP;
    start--;
  }
  return { start, end: activeIndex + 1 };
};
