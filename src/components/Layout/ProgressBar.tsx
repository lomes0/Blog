"use client";

import NProgress from "nprogress";
import { usePathname, useSearchParams } from "next/navigation";
import { memo, useEffect } from "react";

/**
 * The bar is started by `nprogressMiddleware` — one refcount over the reads
 * that fetch something the user is waiting to look at, writes deliberately
 * excluded — and ended here when a navigation commits.
 *
 * There used to be a second source: a click handler bound to every `a[href]` in
 * the document, rebound by a `MutationObserver` on every DOM change, that
 * started the bar on navigation. It never once ran. It deferred to
 * `setTimeout(0)` and bailed on `event.defaultPrevented`, and Next's `<Link>`
 * calls `preventDefault()` to do the client-side navigation — so by the time
 * the callback fired, the flag was always set. Every in-app link took the dead
 * path; the only anchors that got past it were full page loads, which discard
 * the bar along with the document. It was removed rather than fixed: the
 * middleware already covers the part of a navigation that takes time.
 */
export default memo(function ProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // `done()` keeps its own guard — it is a no-op unless the bar is showing —
  // so a navigation with nothing in flight does not flash one. How the bar is
  // configured and driven belongs to `nprogressMiddleware`.
  useEffect(() => {
    NProgress.done();
  }, [pathname, searchParams]);

  return null;
});
