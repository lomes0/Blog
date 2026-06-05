"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type RailMode = "full" | "compact" | "hidden";
export type ViewMode = "read" | "focus" | "edit";

const RAIL_CYCLE: RailMode[] = ["full", "compact"];
const RAIL_MODE_KEY = "ui.railMode";
const RAIL_WIDTH_KEY = "ui.railWidth";
export const RAIL_DEFAULT_W = 280;
export const RAIL_MIN_W = 180;
export const RAIL_MAX_W = 520;
export const RAIL_COMPACT_W = 54;

interface LayoutModeContextType {
  railMode: RailMode;
  toggleRail: () => void;
  viewMode: ViewMode;
  setFocus: () => void;
  setRead: () => void;
  /** User's preferred rail width (full mode only) */
  railWidth: number;
  /** Whether the user is currently dragging the rail resize handle */
  isRailResizing: boolean;
  /** Start a rail resize drag */
  startRailResize: (e: React.MouseEvent) => void;
}

const LayoutModeContext = createContext<LayoutModeContextType | undefined>(
  undefined,
);

export const useLayoutMode = () => {
  const ctx = useContext(LayoutModeContext);
  if (!ctx) {
    throw new Error("useLayoutMode must be used within LayoutModeProvider");
  }
  return ctx;
};

export const LayoutModeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [railMode, setRailMode] = useState<RailMode>("full");
  // viewMode is intentionally not persisted — resets to "read" on mount/navigation
  const [viewMode, setViewMode] = useState<ViewMode>("read");
  const [railWidth, setRailWidth] = useState(RAIL_DEFAULT_W);
  const [isRailResizing, setIsRailResizing] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(RAIL_MODE_KEY) as RailMode | null;
    if (saved && RAIL_CYCLE.includes(saved)) setRailMode(saved);
    else if (saved === "hidden") setRailMode("compact");
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(RAIL_WIDTH_KEY);
    if (!saved) return;
    const parsed = parseInt(saved, 10);
    if (parsed >= RAIL_MIN_W && parsed <= RAIL_MAX_W) setRailWidth(parsed);
  }, []);

  const toggleRail = useCallback(() => {
    setRailMode((prev) => {
      const next =
        RAIL_CYCLE[(RAIL_CYCLE.indexOf(prev) + 1) % RAIL_CYCLE.length];
      localStorage.setItem(RAIL_MODE_KEY, next);
      return next;
    });
  }, []);

  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const currentRailWidthRef = useRef(railWidth);

  useEffect(() => {
    currentRailWidthRef.current = railWidth;
  }, [railWidth]);

  const handleRailMouseMove = useCallback((e: MouseEvent) => {
    // Rail is on the right; dragging left (smaller clientX) widens it
    const newWidth = Math.min(
      Math.max(
        startWidthRef.current - (e.clientX - startXRef.current),
        RAIL_MIN_W,
      ),
      RAIL_MAX_W,
    );
    setRailWidth(newWidth);
  }, []);

  const handleRailMouseUp = useCallback(() => {
    setIsRailResizing(false);
    localStorage.setItem(
      RAIL_WIDTH_KEY,
      currentRailWidthRef.current.toString(),
    );
  }, []);

  useEffect(() => {
    if (!isRailResizing) return;
    document.addEventListener("mousemove", handleRailMouseMove);
    document.addEventListener("mouseup", handleRailMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", handleRailMouseMove);
      document.removeEventListener("mouseup", handleRailMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isRailResizing, handleRailMouseMove, handleRailMouseUp]);

  const startRailResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsRailResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = currentRailWidthRef.current;
  }, []);

  const setFocus = useCallback(() => setViewMode("focus"), []);
  const setRead = useCallback(() => setViewMode("read"), []);

  return (
    <LayoutModeContext.Provider
      value={{
        railMode,
        toggleRail,
        viewMode,
        setFocus,
        setRead,
        railWidth,
        isRailResizing,
        startRailResize,
      }}
    >
      {children}
    </LayoutModeContext.Provider>
  );
};
