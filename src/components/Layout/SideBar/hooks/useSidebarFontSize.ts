"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "sidebarFontSize";
const DEFAULT_FONT_SIZE = 16;
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 24;

/**
 * The sidebar's base font size, shared by every caller.
 *
 * This was `useState` per call site, which meant the three components that read
 * it — the Settings +/- control, the sidebar paper it is supposed to resize, and
 * now `SidebarWidthProvider`, which derives the minimum open width from it —
 * each held their own copy. Pressing "+" wrote localStorage and re-rendered the
 * Settings panel only; the sidebar it was sizing did not move until reload.
 *
 * A module-level store fixes that without a context: this is one number with one
 * writer and no provider to place, and `useSyncExternalStore` is exactly the
 * hook for state that lives outside React.
 *
 * The store starts at the default rather than at the stored value, and hydrates
 * in an effect below. Reading localStorage in `getSnapshot` would run during
 * render, where the server has no answer — a hydration mismatch on every sidebar
 * label at once. (Same reason `readStoredWidth` insists on being called from an
 * effect.)
 */
let fontSize = DEFAULT_FONT_SIZE;
let hydrated = false;
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getSnapshot = () => fontSize;

const setFontSize = (next: number) => {
  const clamped = Math.min(Math.max(next, MIN_FONT_SIZE), MAX_FONT_SIZE);
  if (clamped === fontSize) return;
  fontSize = clamped;
  localStorage.setItem(STORAGE_KEY, String(clamped));
  listeners.forEach((fn) => fn());
};

export function useSidebarFontSize() {
  const sidebarFontSize = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => DEFAULT_FONT_SIZE,
  );

  // Runs once for the whole app, not once per caller: the flag is module state.
  useEffect(() => {
    if (hydrated) return;
    hydrated = true;
    const saved = parseInt(localStorage.getItem(STORAGE_KEY) ?? "", 10);
    if (Number.isFinite(saved)) setFontSize(saved);
  }, []);

  const increaseFontSize = useCallback(() => setFontSize(fontSize + 1), []);
  const decreaseFontSize = useCallback(() => setFontSize(fontSize - 1), []);
  const resetFontSize = useCallback(() => setFontSize(DEFAULT_FONT_SIZE), []);

  return { sidebarFontSize, increaseFontSize, decreaseFontSize, resetFontSize };
}
