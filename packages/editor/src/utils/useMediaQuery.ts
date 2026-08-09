"use client";
import { useEffect, useState } from "react";

/**
 * `window.matchMedia`, as a hook — MUI's `useMediaQuery` without MUI.
 *
 * The editor package is being taken off `@mui/material`, and its `useTheme()`
 * companion is the only other way to reach the breakpoint values, so the two
 * had to go together. Callers pass the query text; the numbers themselves are
 * transcribed at the point of use next to the `@media` rule they pair with, so
 * a layout that collapses in CSS and a control that disappears in JS cannot
 * disagree about where.
 *
 * Starts `false` on the server and on the first client render, then corrects in
 * the effect. That is MUI's default behaviour too (its `ssrMatchMedia` option
 * exists precisely because there is no better answer), so nothing that reads
 * this hook is newly hydration-sensitive.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}
