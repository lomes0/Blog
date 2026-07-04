"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTheme } from "@mui/material/styles";
import { useMediaQuery } from "@mui/material";
import { usePathname } from "next/navigation";
import {
  SIDEBAR_COLLAPSE_THRESHOLD,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_DRAG_FLOOR,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MODE_KEY,
  SIDEBAR_STORAGE_KEY,
} from "@/components/Layout/SideBar/constants";

export type SidebarMode = "full" | "hidden";

interface SidebarWidthContextType {
  /** The user's preferred expanded width (persisted to localStorage) */
  width: number;
  /** Whether the user is currently dragging the resize handle */
  isResizing: boolean;
  /** Start a resize operation */
  startResize: (e: React.MouseEvent) => void;
  /** Reset width to default */
  resetWidth: () => void;
  /** Effective sidebar pixel width for the current mode */
  getEffectiveWidth: () => number;
  /** Current sidebar mode */
  sidebarMode: SidebarMode;
  /** Set sidebar mode directly */
  setSidebarMode: (mode: SidebarMode) => void;
  /** Toggle hidden ↔ full (open/close) */
  toggleSidebar: () => void;
  /** True when sidebar is not hidden (Drawer open prop) */
  sidebarOpen: boolean;
  /** Whether the viewport is mobile-sized */
  isMobile: boolean;
}

const SidebarWidthContext = createContext<SidebarWidthContextType | undefined>(
  undefined,
);

export const useSidebarWidth = () => {
  const context = useContext(SidebarWidthContext);
  if (!context) {
    throw new Error(
      "useSidebarWidth must be used within SidebarWidthProvider",
    );
  }
  return context;
};

export const SidebarWidthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const pathname = usePathname();

  const [width, setWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarMode, setSidebarModeState] = useState<SidebarMode>(
    isMobile ? "hidden" : "full",
  );

  // Restore persisted mode (full/compact) on desktop after mount.
  useEffect(() => {
    if (isMobile) return;
    const saved = localStorage.getItem(SIDEBAR_MODE_KEY) as SidebarMode | null;
    if (saved === "full" || saved === "hidden") setSidebarModeState(saved);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setSidebarMode = useCallback((mode: SidebarMode) => {
    setSidebarModeState(mode);
    if (mode === "full" || mode === "hidden") {
      localStorage.setItem(SIDEBAR_MODE_KEY, mode);
    }
  }, []);

  // Toggle hidden ↔ full (open/close).
  const toggleSidebar = useCallback(() => {
    setSidebarModeState((prev) => (prev === "hidden" ? "full" : "hidden"));
  }, []);

  // Force hidden on mobile navigation.
  useEffect(() => {
    if (isMobile) setSidebarModeState("hidden");
  }, [pathname, isMobile]);

  // Sync mode when screen size flips.
  useEffect(() => {
    if (isMobile) {
      setSidebarModeState("hidden");
    } else {
      const saved = localStorage.getItem(SIDEBAR_MODE_KEY) as
        | SidebarMode
        | null;
      setSidebarModeState(saved === "hidden" ? "hidden" : "full");
    }
  }, [isMobile]);

  // ── Width persistence ──────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (!saved) return;
    const parsed = parseInt(saved, 10);
    if (parsed >= SIDEBAR_MIN_WIDTH && parsed <= SIDEBAR_MAX_WIDTH) {
      setWidth(parsed);
    }
  }, []);

  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const currentWidthRef = useRef(width);

  useEffect(() => {
    currentWidthRef.current = width;
  }, [width]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    // Allow dragging below MIN into the "collapse zone" (down to the drag floor)
    // so the panel can be dragged shut with live feedback; MAX still caps growth.
    const newWidth = Math.min(
      Math.max(
        startWidthRef.current + (e.clientX - startXRef.current),
        SIDEBAR_DRAG_FLOOR,
      ),
      SIDEBAR_MAX_WIDTH,
    );
    setWidth(newWidth);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    if (currentWidthRef.current < SIDEBAR_COLLAPSE_THRESHOLD) {
      // Dragged shut: collapse to hidden and restore the pre-drag width so the
      // sidebar reopens at its previous size.
      setWidth(startWidthRef.current);
      setSidebarMode("hidden");
    } else {
      // Otherwise snap back up to at least MIN and persist the resting width.
      const resting = Math.max(currentWidthRef.current, SIDEBAR_MIN_WIDTH);
      setWidth(resting);
      localStorage.setItem(SIDEBAR_STORAGE_KEY, resting.toString());
    }
  }, [setSidebarMode]);

  useEffect(() => {
    if (!isResizing) return;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      startXRef.current = e.clientX;
      startWidthRef.current = width;
    },
    [width],
  );

  const resetWidth = useCallback(() => {
    setWidth(SIDEBAR_DEFAULT_WIDTH);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, SIDEBAR_DEFAULT_WIDTH.toString());
  }, []);

  const getEffectiveWidth = useCallback((): number => {
    if (sidebarMode === "hidden") return 0;
    return width;
  }, [width, sidebarMode]);

  return (
    <SidebarWidthContext.Provider
      value={{
        width,
        isResizing,
        startResize,
        resetWidth,
        getEffectiveWidth,
        sidebarMode,
        setSidebarMode,
        toggleSidebar,
        sidebarOpen: sidebarMode !== "hidden",
        isMobile,
      }}
    >
      {children}
    </SidebarWidthContext.Provider>
  );
};
