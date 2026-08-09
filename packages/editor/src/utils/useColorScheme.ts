"use client";
import { useEffect, useState } from "react";

export type ColorScheme = "light" | "dark";

/**
 * Read the active color scheme off `html.dark` — the class MUI's
 * `InitColorSchemeScript` writes and `colorSchemeSelector: "class"` keeps in
 * sync with the in-app toggle (DESIGN.md §19.1).
 *
 * This is the *only* way the editor package should learn the scheme in JS.
 * `useTheme().palette.mode` from `@mui/material/styles` gives the same answer
 * and drags MUI back into a package that is being taken off it; the class is
 * also the same thing every stylesheet and every `.css.ts` in here keys off,
 * so a component and its styles cannot disagree.
 */
export function readColorScheme(): ColorScheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * …and subscribe to it, for the handful of places that must hand the scheme to
 * something that cannot read CSS itself — an embedded third-party app with its
 * own theming (Excalidraw), a canvas, an exported image.
 */
export function useColorScheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>(readColorScheme);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setScheme(readColorScheme()));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    // The class may have flipped between first render and this effect.
    setScheme(readColorScheme());
    return () => observer.disconnect();
  }, []);

  return scheme;
}
