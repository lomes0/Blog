/**
 * Where each document was left, so a reload does not land you at the top.
 *
 * The arithmetic lives here, import-free, for the same reason `dragGeometry.ts`
 * does: it can be exercised without mounting anything. The DOM half is
 * `components/EditDocument/hooks/useScrollMemory.ts` and the storage half rides
 * in the workspace record (`store/workspacePersistence.ts`) — a scroll position
 * is the same kind of fact as a split ratio, device-local and per document, so
 * it belongs in the same place rather than in a second store with its own
 * lifetime.
 */

/**
 * How many documents to remember.
 *
 * The map is written to IndexedDB on every scroll, so it cannot grow without
 * bound across a long-lived profile: someone who opens a hundred documents a
 * week would otherwise carry all of them forever. Fifty is far more than the
 * set anyone cycles between, and the cost of forgetting is one document opening
 * at the top.
 */
export const MAX_REMEMBERED = 50;

/** A document id to the offset it was last left at, in CSS pixels. */
export type ScrollTops = Record<string, number>;

/**
 * Read a stored map back without trusting it.
 *
 * What comes out of IndexedDB was written by some build of this app at some
 * time — the same argument `readStoredWorkspace` makes for handing its caller
 * `unknown`. A negative offset, a `NaN`, a string that used to be a number or
 * an outright wrong shape all have to be survivable, because none of them is
 * worth failing a document load over.
 */
export function sanitizeScrollTops(stored: unknown): ScrollTops {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  const out: ScrollTops = {};
  for (const [id, value] of Object.entries(stored as Record<string, unknown>)) {
    if (!id) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      continue;
    }
    out[id] = Math.round(value);
  }
  return capScrollTops(out);
}

/**
 * Trim to {@link MAX_REMEMBERED}, dropping the oldest entries.
 *
 * Insertion order is the eviction order, which is what makes this correct
 * without storing a timestamp per document: `rememberScroll` deletes a key
 * before re-adding it, so every write moves that document to the end and the
 * front of the object is genuinely the least recently touched.
 */
export function capScrollTops(tops: ScrollTops): ScrollTops {
  const ids = Object.keys(tops);
  if (ids.length <= MAX_REMEMBERED) return tops;
  const out: ScrollTops = {};
  for (const id of ids.slice(ids.length - MAX_REMEMBERED)) out[id] = tops[id];
  return out;
}

/**
 * The furthest a scroller can actually be moved.
 *
 * Assigning past this is not an error — the browser silently clamps — which is
 * precisely the problem this exists to make visible: a restore that reads back
 * lower than it asked for has not failed, it is waiting for content that has
 * not rendered yet. Distinguishing those two is {@link isRestoreSettled}'s job.
 */
export function clampScrollTop(
  target: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const max = Math.max(0, scrollHeight - clientHeight);
  return Math.min(Math.max(0, target), max);
}

/**
 * Whether a restore attempt can stop retrying.
 *
 * A pane's content arrives in pieces — the document header, then Lexical's
 * first render, then images and embeds resolving their own heights — so the
 * first assignment of `scrollTop` usually lands short and has to be repeated as
 * the scroller grows. Settled means one of:
 *
 * - the scroller reached the target, within a pixel of rounding; or
 * - the content is fully rendered and the target is simply past its end, which
 *   happens when the document got shorter since it was last open. Retrying
 *   cannot fix that, and holding the loop open until its deadline would keep
 *   fighting a user who has started scrolling.
 *
 * `grown` is the caller's answer to "has the scroller stopped changing size" —
 * `false` while it is still growing, so a short landing is treated as
 * not-yet-ready rather than as a truncated target.
 */
export function isRestoreSettled(
  { target, actual, scrollHeight, clientHeight, grown }: {
    target: number;
    actual: number;
    scrollHeight: number;
    clientHeight: number;
    grown: boolean;
  },
): boolean {
  if (Math.abs(actual - target) <= 1) return true;
  return grown && actual >= clampScrollTop(target, scrollHeight, clientHeight);
}

/**
 * Whether a new offset is worth writing.
 *
 * The scroll listener fires per frame during a fling, and every write schedules
 * an IndexedDB transaction. Sub-threshold moves are not worth one, and neither
 * is a repeat of the value already held — which is what a `scroll` event fired
 * by a clamp, a focus, or the restore itself amounts to.
 *
 * Note that `0` is a legitimate position to record: scrolling back to the top
 * is a real intent, and treating it as "nothing to remember" would make the top
 * of a document the one place you could not return to.
 */
export function shouldRecord(
  previous: number | undefined,
  next: number,
  threshold = 4,
): boolean {
  if (!Number.isFinite(next) || next < 0) return false;
  if (previous === undefined) return true;
  return Math.abs(next - previous) >= threshold;
}
