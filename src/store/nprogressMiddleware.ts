import NProgress from "nprogress";
import type { Middleware } from "@reduxjs/toolkit";

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

export const nprogressMiddleware: Middleware = () => (next) => (action) => {
  if (typeof (action as { type?: string }).type === "string") {
    const { type } = action as { type: string };
    if (isTracked(type)) {
      if (type.endsWith("/pending")) {
        if (inFlight === 0) NProgress.start();
        inFlight++;
      } else if (type.endsWith("/fulfilled") || type.endsWith("/rejected")) {
        inFlight = Math.max(0, inFlight - 1);
        if (inFlight === 0) NProgress.done();
      }
    }
  }
  return next(action);
};
