"use client";
import useIsHydrated from "./useIsHydrated";

/**
 * The origin this app is being served from, for building preview URLs shown to
 * the user ("your post will live at …").
 *
 * `PUBLIC_URL` is a server-only variable, so a client component cannot read it;
 * the origin is the honest client-side answer. Returns `""` until hydration so
 * the server and first client render agree — callers should render the path
 * alone in that frame rather than branching on it.
 *
 * This exists because the two handle fields used to hardcode the domain of the
 * project this app was forked from, and so promised every user a URL that does
 * not resolve.
 */
export default function useOrigin(): string {
  const isHydrated = useIsHydrated();
  return isHydrated ? window.location.origin : "";
}
