/**
 * When a code block is long enough to be worth collapsing, and how tall it is
 * once it is (docs/plans/code-block-card.md §4.3).
 *
 * Import-free — the `dragGeometry.ts` / `imageLayout.ts` rule — so
 * `__tests__/codeCollapse.test.ts` exercises it with no DOM, no editor and no
 * stylesheet. §6 names this as the one piece of pure logic in the card, and so
 * the place the arithmetic will be wrong.
 *
 * **Lines with a pixel ceiling, not `50vh`.** haklex collapses at half the
 * viewport; the editor here is a *pane*, and in a split workspace half the
 * viewport can be most of it — a block "collapsed" to that is still as tall as
 * the space it was collapsed to fit into. A line count says what the reader
 * actually gets; the ceiling stops a large font undoing it.
 *
 * **Two callers, one rule.** The editor measures, because `__wrap` and
 * `__width` both change how tall the same source renders, and feeds
 * {@link exceedsCollapseThreshold} from a `ResizeObserver`. The reader's header
 * is static HTML from `exportDOM` and cannot measure, so it asks
 * {@link lineCountExceedsCollapseThreshold} — the same rule with the height
 * predicted. Neither surface owns a threshold of its own.
 */

/** Lines of context a collapsed block keeps. */
export const COLLAPSED_LINES = 24;

/** No collapsed block is taller than this, whatever the line height… */
export const COLLAPSE_MAX_PX = 520;

/** …nor shorter, so it still reads as a code block. */
export const COLLAPSE_MIN_PX = 160;

/**
 * `13.5px × 1.62` from `.LexicalTheme__code`, rounded. Only ever a fallback:
 * the editor passes what it measured, the reader has nothing to pass.
 */
export const DEFAULT_LINE_HEIGHT_PX = 22;

/** `.code-card-body`'s vertical padding, top plus bottom. */
export const BODY_PADDING_Y_PX = 32;

/**
 * How far past the threshold before the control appears. Without it, a block
 * one line over gets a button that hides one line.
 */
export const COLLAPSE_SLACK_LINES = 2;

/** A usable line height, whatever the caller measured. */
function lineHeight(lineHeightPx?: number): number {
  return typeof lineHeightPx === "number" && Number.isFinite(lineHeightPx) &&
      lineHeightPx > 0
    ? lineHeightPx
    : DEFAULT_LINE_HEIGHT_PX;
}

/** The `max-height` a collapsed body is clamped to, in CSS pixels. */
export function collapsedBodyHeightPx(lineHeightPx?: number): number {
  const raw = COLLAPSED_LINES * lineHeight(lineHeightPx) + BODY_PADDING_Y_PX;
  return Math.round(Math.min(COLLAPSE_MAX_PX, Math.max(COLLAPSE_MIN_PX, raw)));
}

/** Whether a body of this rendered height earns a collapse control. */
export function exceedsCollapseThreshold(
  contentHeightPx: number,
  lineHeightPx?: number,
): boolean {
  if (!Number.isFinite(contentHeightPx)) return false;
  const lh = lineHeight(lineHeightPx);
  return contentHeightPx >
    collapsedBodyHeightPx(lh) + COLLAPSE_SLACK_LINES * lh;
}

/**
 * The same question from a line count, for a surface that cannot measure.
 * `exportDOM` already counts the lines to build the gutter.
 */
export function lineCountExceedsCollapseThreshold(
  lineCount: number,
  lineHeightPx?: number,
): boolean {
  if (!Number.isFinite(lineCount)) return false;
  const lh = lineHeight(lineHeightPx);
  return exceedsCollapseThreshold(
    Math.max(0, lineCount) * lh + BODY_PADDING_Y_PX,
    lh,
  );
}
