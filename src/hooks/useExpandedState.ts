import { useCallback, useState } from "react";

export function useExpandedState(storageKey: string) {
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(() => {
    const saved = typeof window !== "undefined"
      ? localStorage.getItem(storageKey)
      : null;
    if (saved) {
      try {
        return new Set<string>(JSON.parse(saved));
      } catch {
        // ignore parse errors
      }
    }
    return new Set<string>();
  });

  const toggleSeries = useCallback((seriesId: string) => {
    setExpandedSeries((prev) => {
      const next = new Set(prev);
      if (next.has(seriesId)) next.delete(seriesId);
      else next.add(seriesId);
      if (typeof window !== "undefined") {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      }
      return next;
    });
  }, [storageKey]);

  // Idempotent expand: adds the id if missing, leaving the state reference
  // untouched when it is already expanded (so callers can safely run it from an
  // effect without triggering a re-render loop).
  const expand = useCallback((id: string) => {
    setExpandedSeries((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      if (typeof window !== "undefined") {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      }
      return next;
    });
  }, [storageKey]);

  return { expandedSeries, toggleSeries, expand };
}
