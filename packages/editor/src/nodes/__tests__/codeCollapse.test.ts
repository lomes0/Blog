/**
 * The collapse threshold (docs/plans/code-block-card.md §4.3, §6).
 *
 * `collapse.ts` is the only pure logic in the card and §6 names it as the place
 * the arithmetic will be wrong, so it is import-free and this spec runs against
 * it with no DOM, no editor and no stylesheet — the `dragGeometry.ts` /
 * `imageLayout.ts` rule.
 *
 * The three claims worth pinning are the ones that would fail silently: that
 * the pixel ceiling actually binds (a line count alone would let a large font
 * "collapse" a block to a screenful), that the slack keeps a block one line
 * over the line from growing a control that hides one line, and that the two
 * entry points — the editor's measured height and the reader's line count —
 * cannot answer differently for the same block.
 */
import {
  BODY_PADDING_Y_PX,
  COLLAPSE_MAX_PX,
  COLLAPSE_MIN_PX,
  COLLAPSE_SLACK_LINES,
  COLLAPSED_LINES,
  collapsedBodyHeightPx,
  DEFAULT_LINE_HEIGHT_PX,
  exceedsCollapseThreshold,
  lineCountExceedsCollapseThreshold,
} from "../CodeNode/collapse";

describe("collapsedBodyHeightPx", () => {
  it("is the line budget plus the body's padding, at a small line height", () => {
    // 8px lines: 24 × 8 + 32 = 224, comfortably inside both bounds, so this is
    // the un-clamped arithmetic on its own.
    expect(collapsedBodyHeightPx(8)).toBe(COLLAPSED_LINES * 8 + BODY_PADDING_Y_PX);
  });

  it("is capped by the ceiling rather than by the line count", () => {
    // The whole reason the module exists rather than a `50vh` rule: the editor
    // is a pane, and 24 lines of a large font is not a budget, it is a screen.
    expect(collapsedBodyHeightPx(60)).toBe(COLLAPSE_MAX_PX);
    // And the default line height is already over the ceiling, so the shipped
    // value *is* the ceiling — if that stops being true the CSS fallback in
    // `theme.css` has drifted from this module.
    expect(collapsedBodyHeightPx()).toBe(COLLAPSE_MAX_PX);
  });

  it("is held above the floor by a tiny line height", () => {
    expect(collapsedBodyHeightPx(1)).toBe(COLLAPSE_MIN_PX);
  });

  it("falls back rather than believing a line height it cannot use", () => {
    for (const bad of [0, -20, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(collapsedBodyHeightPx(bad)).toBe(
        collapsedBodyHeightPx(DEFAULT_LINE_HEIGHT_PX),
      );
    }
  });
});

describe("exceedsCollapseThreshold", () => {
  const lh = 20;
  const limit = collapsedBodyHeightPx(lh) + COLLAPSE_SLACK_LINES * lh;

  it("is false at the threshold and true one pixel past it", () => {
    expect(exceedsCollapseThreshold(limit, lh)).toBe(false);
    expect(exceedsCollapseThreshold(limit + 1, lh)).toBe(true);
  });

  it("leaves the slack unoffered", () => {
    // A block exactly `COLLAPSE_SLACK_LINES` over the collapsed height gets no
    // control: folding it would hide two lines and cost two clicks.
    expect(
      exceedsCollapseThreshold(
        collapsedBodyHeightPx(lh) + COLLAPSE_SLACK_LINES * lh,
        lh,
      ),
    ).toBe(false);
  });

  it("says no to a height it cannot read", () => {
    expect(exceedsCollapseThreshold(Number.NaN, lh)).toBe(false);
  });
});

describe("lineCountExceedsCollapseThreshold", () => {
  it("agrees with the measured rule for the height those lines render at", () => {
    // The editor measures and the reader counts; §4.3 allows the two surfaces
    // different inputs, not different answers.
    const lh = 18;
    for (const lines of [0, 1, 10, 24, 26, 30, 40, 200]) {
      expect(lineCountExceedsCollapseThreshold(lines, lh)).toBe(
        exceedsCollapseThreshold(lines * lh + BODY_PADDING_Y_PX, lh),
      );
    }
  });

  it("offers nothing for a short block and something for a long one", () => {
    expect(lineCountExceedsCollapseThreshold(1)).toBe(false);
    expect(lineCountExceedsCollapseThreshold(COLLAPSED_LINES)).toBe(false);
    expect(lineCountExceedsCollapseThreshold(400)).toBe(true);
  });

  it("treats a negative count as an empty block rather than as a long one", () => {
    expect(lineCountExceedsCollapseThreshold(-50)).toBe(false);
  });

  it("says no to a count it cannot read", () => {
    expect(lineCountExceedsCollapseThreshold(Number.NaN)).toBe(false);
  });
});
