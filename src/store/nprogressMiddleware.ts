import NProgress from "nprogress";
import type { Middleware } from "@reduxjs/toolkit";

/**
 * How the bar is driven.
 *
 * nprogress ships calibrated for multi-second full page loads: it opens at
 * `minimum` (8%), waits `trickleSpeed` (800ms) for its first tick, and each
 * tick adds at most `trickleRate` (2%). Opening a document here takes about
 * 450ms — the load is over before that first tick can fire — so the bar had
 * exactly two states, 8% and 100%, and was never seen to move at all.
 *
 * So trickle is off, and the motion comes from a single transition instead:
 * `set(0.9)` sweeps the bar toward 90% over `speed`. That is a CSS `transform`
 * transition, which the compositor runs, so it keeps moving even while the
 * main thread is busy parsing the document.
 *
 * `speed` doubles as the pacing of nprogress's internal queue — a queued `set`
 * holds the one behind it for `speed` ms — so it is kept near the length of a
 * typical open rather than long enough to defer the finish.
 *
 * Configured here rather than in `ProgressBar` because it is this file that
 * depends on the values. Merging settings touches no DOM, so module scope is
 * safe under SSR.
 */
/** How long the bar takes to sweep from nothing to 90%. */
const SWEEP_MS = 400;
/**
 * How long it takes to complete and clear once the work is done. Separate
 * because `speed` is also what nprogress waits before fading and again before
 * removing, so leaving it at {@link SWEEP_MS} left the bar on screen for most
 * of a second after the document was already up.
 */
const FINISH_MS = 120;

NProgress.configure({
  showSpinner: false,
  trickle: false,
  easing: "linear",
  speed: SWEEP_MS,
});

/**
 * Action type prefixes of thunks that may perform network requests.
 * NProgress is shown while any of these are in-flight.
 *
 * These are backend-agnostic now: against the local backend they resolve in the
 * same tick, so the bar never has time to appear.
 */
const TRACKED_PREFIXES = [
  "app/loadPosts",
  "app/getPost",
  "app/forkPost",
  "app/createPost",
  "app/updatePost",
  "app/deletePost",
  "app/movePost",
  "app/duplicatePost",
  "app/mergePostsIntoTabs",
  "app/getRevision",
  "app/createRevision",
  "app/deleteRevision",
  "app/importGuestDrafts",
  "app/updateUser",
];

function isTracked(type: string): boolean {
  return TRACKED_PREFIXES.some((prefix) => type.startsWith(prefix + "/"));
}

let inFlight = 0;

/**
 * Begin the sweep. One `set`, not `start()` — with trickle off `start()` only
 * ever reaches `minimum` and stays there.
 */
function begin(): void {
  NProgress.set(0.9);
}

/**
 * Complete it. `set(1)` rather than `done()`, which is `inc().set(1)` — two
 * queued operations, and so an extra `speed` before the bar clears. Guarded on
 * `isStarted`, because `set` renders a bar whether or not one was showing.
 */
function finish(): void {
  if (!NProgress.isStarted()) return;
  // `set` reads `speed` when it is called, not when its queued work runs, so
  // lowering it around this one call shortens the completion and the fade
  // without shortening the sweep above.
  NProgress.configure({ speed: FINISH_MS });
  NProgress.set(1);
  NProgress.configure({ speed: SWEEP_MS });
}

export const nprogressMiddleware: Middleware = () => (next) => (action) => {
  if (typeof (action as { type?: string }).type === "string") {
    const { type } = action as { type: string };
    if (isTracked(type)) {
      if (type.endsWith("/pending")) {
        if (inFlight === 0) begin();
        inFlight++;
      } else if (type.endsWith("/fulfilled") || type.endsWith("/rejected")) {
        inFlight = Math.max(0, inFlight - 1);
        if (inFlight === 0) finish();
      }
    }
  }
  return next(action);
};
