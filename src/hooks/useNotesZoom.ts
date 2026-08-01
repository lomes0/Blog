import { useCallback, useEffect, useState } from "react";

const NOTES_ZOOM_MIN = 0.25;
const NOTES_ZOOM_MAX = 2.0;
const NOTES_ZOOM_STEP = 0.25;
const NOTES_ZOOM_DEFAULT = 1.0;

function storageKey(canvasId: string | null) {
  return `notes-canvas-zoom-${canvasId ?? "default"}`;
}

function readStored(canvasId: string | null): number {
  if (typeof window === "undefined") return NOTES_ZOOM_DEFAULT;
  const raw = localStorage.getItem(storageKey(canvasId));
  if (raw) {
    const v = parseFloat(raw);
    if (!isNaN(v) && v >= NOTES_ZOOM_MIN && v <= NOTES_ZOOM_MAX) return v;
  }
  return NOTES_ZOOM_DEFAULT;
}

export interface NotesZoom {
  scale: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
}

export function useNotesZoom(canvasId: string | null): NotesZoom {
  const [scale, setScale] = useState<number>(() => readStored(canvasId));

  // When switching boards, load the persisted zoom for that board
  useEffect(() => {
    setScale(readStored(canvasId));
  }, [canvasId]);

  // Persist whenever scale changes
  useEffect(() => {
    localStorage.setItem(storageKey(canvasId), String(scale));
  }, [canvasId, scale]);

  const zoomIn = useCallback(() => {
    setScale((s) =>
      Math.min(NOTES_ZOOM_MAX, parseFloat((s + NOTES_ZOOM_STEP).toFixed(2)))
    );
  }, []);

  const zoomOut = useCallback(() => {
    setScale((s) =>
      Math.max(NOTES_ZOOM_MIN, parseFloat((s - NOTES_ZOOM_STEP).toFixed(2)))
    );
  }, []);

  const resetZoom = useCallback(() => {
    setScale(NOTES_ZOOM_DEFAULT);
  }, []);

  return {
    scale,
    zoomIn,
    zoomOut,
    resetZoom,
    canZoomIn: scale < NOTES_ZOOM_MAX,
    canZoomOut: scale > NOTES_ZOOM_MIN,
  };
}
