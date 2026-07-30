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
  COMPACT_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_DETENT_RADIUS,
  SIDEBAR_DETENT_STRENGTH,
  SIDEBAR_FULL_EXIT,
  SIDEBAR_HIDE_BREAK,
  SIDEBAR_HIDE_REENTRY,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MODE_KEY,
  SIDEBAR_SPRING_DAMPING,
  SIDEBAR_SPRING_STIFFNESS,
  SIDEBAR_STORAGE_KEY,
} from "@/components/Layout/SideBar/constants";

export type SidebarMode = "full" | "compact" | "hidden";

/**
 * Which mode a release at this cursor width would land in. Hysteresis is
 * carried through `prev`, so the zone can't chatter when the cursor sits on a
 * boundary — the previewed content would flicker with it.
 */
const zoneFor = (raw: number, prev: SidebarMode): SidebarMode => {
  if (prev === "hidden") {
    return raw >= SIDEBAR_HIDE_REENTRY ? "compact" : "hidden";
  }
  if (raw < SIDEBAR_HIDE_BREAK) return "hidden";
  if (prev === "full") return raw < SIDEBAR_FULL_EXIT ? "compact" : "full";
  return raw >= SIDEBAR_MIN_WIDTH ? "full" : "compact";
};

/**
 * Cursor width → painted width. Inside the detent radius the panel is drawn
 * toward `COMPACT_WIDTH`, most strongly at the centre, so the width lags the
 * cursor. Once the zone is `hidden` the attraction is gone and the width meets
 * the cursor again — that discontinuity *is* the break-loose pop.
 */
const applyDetent = (raw: number, zone: SidebarMode): number => {
  if (zone === "hidden") return Math.max(0, raw);
  // Gated on the zone, not on `raw < MIN_WIDTH`: inside the full zone's
  // hysteresis band the two disagree, and attracting the panel toward compact
  // while previewing full paints a width the release then springs away from.
  if (zone === "full") return Math.min(raw, SIDEBAR_MAX_WIDTH);
  const delta = raw - COMPACT_WIDTH;
  const pull = 1 - Math.min(Math.abs(delta) / SIDEBAR_DETENT_RADIUS, 1);
  return raw - delta * pull * SIDEBAR_DETENT_STRENGTH;
};

interface SidebarWidthContextType {
  /** The user's preferred expanded width (persisted to localStorage) */
  width: number;
  /** Whether the user is currently dragging the resize handle */
  isResizing: boolean;
  /** Whether the release spring is still settling */
  isAnimating: boolean;
  /** Start a resize operation. The drag begins at the current mode's width, so
   * the same handle works whether it is sitting at the full panel's edge, the
   * compact rail's edge, or flush against the rail at 0. */
  startResize: (e: React.MouseEvent) => void;
  /** Reset width to default */
  resetWidth: () => void;
  /** Effective sidebar pixel width right now (drag/spring aware) */
  getEffectiveWidth: () => number;
  /** Current committed sidebar mode */
  sidebarMode: SidebarMode;
  /** Mode a release would land in, while dragging; null otherwise. Drives the
   * live content preview so the drag is WYSIWYG. */
  dragZone: SidebarMode | null;
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
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const pathname = usePathname();

  const [width, setWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarMode, setSidebarModeState] = useState<SidebarMode>(
    isMobile ? "hidden" : "full",
  );
  // Live drag width and zone. `width` deliberately does NOT track the drag — it
  // stays the user's preferred full width, so dragging through compact/hidden
  // and back out reopens at the size they chose.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [dragZone, setDragZone] = useState<SidebarMode | null>(null);
  const [animWidth, setAnimWidth] = useState<number | null>(null);

  // Restore persisted mode (full/compact/hidden) on desktop after mount.
  useEffect(() => {
    if (isMobile) return;
    const saved = localStorage.getItem(SIDEBAR_MODE_KEY) as SidebarMode | null;
    if (saved === "full" || saved === "compact" || saved === "hidden") {
      setSidebarModeState(saved);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setSidebarMode = useCallback((mode: SidebarMode) => {
    setSidebarModeState(mode);
    localStorage.setItem(SIDEBAR_MODE_KEY, mode);
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
      setSidebarModeState(
        saved === "hidden" || saved === "compact" ? saved : "full",
      );
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
  const rawRef = useRef(0);
  const paintedRef = useRef(0);
  const zoneRef = useRef<SidebarMode>("full");
  const springRef = useRef<number | null>(null);

  // ── Settle spring ──────────────────────────────────────────────────────────
  const stopSpring = useCallback(() => {
    if (springRef.current !== null) {
      cancelAnimationFrame(springRef.current);
      springRef.current = null;
    }
  }, []);

  /**
   * Under-damped spring (ζ ≈ 0.55) from `from` to `to`, driving `animWidth`.
   * Hand-rolled because the app has no animation library — `@react-spring/web`
   * appears only as a transitive `overrides` pin, not a dependency we can import.
   */
  const runSpring = useCallback((from: number, to: number) => {
    stopSpring();
    if (reducedMotion || Math.abs(to - from) < 0.5) {
      setAnimWidth(null);
      return;
    }
    let x = from;
    let v = 0;
    let last = performance.now();
    setAnimWidth(x);
    const step = (now: number) => {
      // Clamp dt so a backgrounded tab doesn't integrate one huge unstable step.
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const accel = SIDEBAR_SPRING_STIFFNESS * (to - x) -
        SIDEBAR_SPRING_DAMPING * v;
      v += accel * dt;
      x += v * dt;
      if (Math.abs(to - x) < 0.5 && Math.abs(v) < 5) {
        springRef.current = null;
        setAnimWidth(null); // hand back to the mode-derived width
        return;
      }
      // Undershooting 0 is the one place the overshoot is not harmless: it would
      // emit a negative width and an invalid grid track.
      setAnimWidth(Math.max(0, x));
      springRef.current = requestAnimationFrame(step);
    };
    springRef.current = requestAnimationFrame(step);
  }, [reducedMotion, stopSpring]);

  useEffect(() => stopSpring, [stopSpring]);

  // ── Drag ───────────────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const raw = Math.min(
      startWidthRef.current + (e.clientX - startXRef.current),
      SIDEBAR_MAX_WIDTH,
    );
    rawRef.current = raw;
    const zone = zoneFor(raw, zoneRef.current);
    zoneRef.current = zone;
    const painted = applyDetent(raw, zone);
    paintedRef.current = painted;
    setDragZone(zone);
    setDragWidth(painted);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    const zone = zoneRef.current;
    const from = paintedRef.current;
    setDragZone(null);
    setDragWidth(null);

    if (zone === "full") {
      // Release in the full zone can't surprise: the zone starts at MIN_WIDTH,
      // so the width shown during the drag is the width we keep.
      const resting = Math.max(
        Math.min(rawRef.current, SIDEBAR_MAX_WIDTH),
        SIDEBAR_MIN_WIDTH,
      );
      setWidth(resting);
      localStorage.setItem(SIDEBAR_STORAGE_KEY, resting.toString());
      setSidebarMode("full");
      runSpring(from, resting);
      return;
    }

    // Compact/hidden: commit the mode immediately so the previewed content
    // stays put, and let the spring animate only the container width.
    setSidebarMode(zone);
    runSpring(from, zone === "compact" ? COMPACT_WIDTH : 0);
  }, [runSpring, setSidebarMode]);

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

  const modeWidth = sidebarMode === "hidden"
    ? 0
    : sidebarMode === "compact"
    ? COMPACT_WIDTH
    : width;

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      stopSpring();
      setAnimWidth(null);
      setIsResizing(true);
      startXRef.current = e.clientX;
      startWidthRef.current = modeWidth;
      rawRef.current = modeWidth;
      paintedRef.current = modeWidth;
      zoneRef.current = sidebarMode;
      setDragZone(sidebarMode);
      setDragWidth(modeWidth);
    },
    [modeWidth, sidebarMode, stopSpring],
  );

  const resetWidth = useCallback(() => {
    setWidth(SIDEBAR_DEFAULT_WIDTH);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, SIDEBAR_DEFAULT_WIDTH.toString());
  }, []);

  // Precedence: settle spring → live drag → committed mode.
  const effectiveWidth = animWidth ?? dragWidth ?? modeWidth;
  const getEffectiveWidth = useCallback(
    (): number => effectiveWidth,
    [effectiveWidth],
  );

  // Collapsing to hidden is a pure width collapse: the content stays fully
  // opaque and is clipped off by the panel edge as it travels. Nothing dims —
  // the break-loose pop already marks the moment the panel commits to closing.

  return (
    <SidebarWidthContext.Provider
      value={{
        width,
        isResizing,
        isAnimating: animWidth !== null,
        startResize,
        resetWidth,
        getEffectiveWidth,
        sidebarMode,
        dragZone,
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
