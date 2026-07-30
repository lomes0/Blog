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
import { useDragCapture } from "@/hooks/useResizablePanel";
import { useSidebarBounds } from "@/components/Layout/SideBar/hooks/useSidebarBounds";
import { useSidebarFontSize } from "@/components/Layout/SideBar/hooks/useSidebarFontSize";
import {
  SIDEBAR_DEFAULT_OPEN_WIDTH,
  SIDEBAR_MODE_KEY,
  SIDEBAR_STORAGE_KEY,
  SIDEBAR_WIDTH_TRANSITION,
} from "@/components/Layout/SideBar/constants";
import {
  clamp,
  COLLAPSE_EASING,
  COLLAPSE_MS,
  COMPACT_WIDTH,
  type Geometry,
  nextPaint,
  type Paint,
  restingWidth,
  type SidebarMode,
} from "@/components/Layout/SideBar/dragGeometry";

export type { SidebarMode };

/** Mode order, narrowest first — the axis the handle's arrow keys step along. */
const MODE_LADDER: SidebarMode[] = ["hidden", "compact", "full"];

const isMode = (v: unknown): v is SidebarMode =>
  v === "full" || v === "compact" || v === "hidden";

interface SidebarWidthContextType {
  /** The user's remembered open width, clamped to the measured bounds. */
  openWidth: number;
  /** Narrowest open panel that still shows its nav labels whole. */
  minOpenWidth: number;
  /** Widest the open panel may go — a share of the viewport. */
  maxOpenWidth: number;
  /** Current committed sidebar mode. Persisted separately from `openWidth`. */
  sidebarMode: SidebarMode;
  /**
   * Mode a release would land in, while dragging; null otherwise. Drives the
   * live content preview so the drag is WYSIWYG.
   */
  dragZone: SidebarMode | null;
  /** Whether the user is currently dragging the resize handle. */
  isResizing: boolean;
  /**
   * Milliseconds of ease-out owed to the width change happening right now, or 0
   * for an instant one. Non-zero on exactly two occasions — dropping out of the
   * free range mid-drag, and closing the release detent's ≤18px gap.
   */
  easeMs: number;
  /** Ready-made `transition` for anything that follows the panel's width. */
  widthTransition: string;
  /** Sidebar pixel width right now (drag aware). */
  getEffectiveWidth: () => number;
  /**
   * Start a resize. The drag begins at the current mode's width, so the same
   * handle works whether it sits at the open panel's edge, the compact rail's
   * edge, or flush against the activity rail at 0.
   */
  startResize: (e: React.MouseEvent) => void;
  /** Set sidebar mode directly. Never touches `openWidth`. */
  setSidebarMode: (mode: SidebarMode) => void;
  /** Step one rung along hidden → compact → full. Never touches `openWidth`. */
  stepSidebarMode: (direction: 1 | -1) => void;
  /** Toggle hidden ↔ full (open/close). */
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
    throw new Error("useSidebarWidth must be used within SidebarWidthProvider");
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

  // ── The two persisted values, kept apart ──────────────────────────────────
  // `mode` and `openWidth` are independent state, and the whole design leans on
  // that: collapsing writes only the mode, so reopening — by drag, rail click,
  // keyboard or a fresh page load — restores the width the user chose. Nothing
  // below writes `openWidth` except a release in the free range.
  const [sidebarMode, setSidebarModeState] = useState<SidebarMode>(
    isMobile ? "hidden" : "full",
  );
  const [storedWidth, setStoredWidth] = useState(SIDEBAR_DEFAULT_OPEN_WIDTH);

  const { sidebarFontSize } = useSidebarFontSize();
  const { min: minOpenWidth, max: maxOpenWidth } = useSidebarBounds(
    sidebarFontSize,
    String(theme.typography.fontFamily),
  );
  const openWidth = clamp(storedWidth, minOpenWidth, maxOpenWidth);

  const [paint, setPaint] = useState<Paint | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [easeMs, setEaseMs] = useState(0);

  const setSidebarMode = useCallback((mode: SidebarMode) => {
    setSidebarModeState(mode);
    localStorage.setItem(SIDEBAR_MODE_KEY, mode);
  }, []);

  const stepSidebarMode = useCallback((direction: 1 | -1) => {
    setSidebarModeState((prev) => {
      const next = MODE_LADDER[
        clamp(MODE_LADDER.indexOf(prev) + direction, 0, MODE_LADDER.length - 1)
      ];
      localStorage.setItem(SIDEBAR_MODE_KEY, next);
      return next;
    });
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarModeState((prev) => {
      const next = prev === "hidden" ? "full" : "hidden";
      localStorage.setItem(SIDEBAR_MODE_KEY, next);
      return next;
    });
  }, []);

  // Force hidden on mobile navigation.
  useEffect(() => {
    if (isMobile) setSidebarModeState("hidden");
  }, [pathname, isMobile]);

  // Restore the persisted mode on desktop — on mount, and again whenever the
  // breakpoint flips back from mobile (where the mode was forced, not chosen).
  useEffect(() => {
    if (isMobile) {
      setSidebarModeState("hidden");
      return;
    }
    const saved = localStorage.getItem(SIDEBAR_MODE_KEY);
    setSidebarModeState(isMode(saved) ? saved : "full");
  }, [isMobile]);

  // Restore the persisted open width. Read in an effect, never in a `useState`
  // initialiser: the server renders the default, so reading during the first
  // render is a hydration mismatch.
  useEffect(() => {
    const saved = parseInt(localStorage.getItem(SIDEBAR_STORAGE_KEY) ?? "", 10);
    // Bounds are checked at use (`openWidth` clamps), not here: they are
    // measured asynchronously, and a width stored before the user changed their
    // font scale is still the width they asked for.
    if (Number.isFinite(saved) && saved > 0) setStoredWidth(saved);
  }, []);

  // ── Easing, which is the exception and not the rule ───────────────────────
  // Held for exactly its own duration, then cleared, so the transition is
  // attached to one width change and not to the drag frames around it.
  const easeTimer = useRef<number | null>(null);
  const ease = useCallback((ms: number) => {
    if (reducedMotion) return;
    if (easeTimer.current !== null) clearTimeout(easeTimer.current);
    setEaseMs(ms);
    easeTimer.current = window.setTimeout(() => {
      easeTimer.current = null;
      setEaseMs(0);
    }, ms);
  }, [reducedMotion]);

  useEffect(() => () => {
    if (easeTimer.current !== null) clearTimeout(easeTimer.current);
  }, []);

  // ── Drag ──────────────────────────────────────────────────────────────────
  // Refs, not state, for everything the move handler reads: `handleMouseMove` is
  // subscribed once for the gesture, and taking these as dependencies would
  // re-subscribe the listener on every frame it caused.
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const paintRef = useRef<Paint>({ mode: "full", width: 0, ease: 0 });
  const geomRef = useRef<Geometry>({ min: 0, max: 0, openWidth: 0 });
  geomRef.current = { min: minOpenWidth, max: maxOpenWidth, openWidth };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const raw = startWidthRef.current + (e.clientX - startXRef.current);
    const next = nextPaint(raw, paintRef.current, geomRef.current, e.altKey);
    paintRef.current = next;
    setPaint(next);
    if (next.ease > 0) ease(next.ease);
  }, [ease]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    const landed = paintRef.current;
    setPaint(null);

    if (landed.mode !== "full") {
      // The painted width already equals the mode's width, so there is no gap
      // to close and nothing to animate — committing the mode is the whole
      // release. `openWidth` is untouched, which is what makes collapsing
      // non-destructive.
      setSidebarMode(landed.mode);
      return;
    }

    // Release detent: land on the remembered width when we are close to it, so a
    // small nudge does not rewrite a width the user already chose. That ≤18px is
    // the only gap a release can have, and the only easing that follows one.
    const resting = restingWidth(landed.width, geomRef.current);

    setStoredWidth(resting);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(resting));
    setSidebarMode("full");
    if (resting !== landed.width) ease(COLLAPSE_MS);
  }, [ease, setSidebarMode]);

  // Shared with the rail/Copilot panels — the pointer capture and the
  // `col-resize` cursor are the same problem for all three. The mapping above is
  // not shared, and is the reason this panel keeps its own loop.
  useDragCapture(isResizing, handleMouseMove, handleMouseUp);

  const modeWidth = sidebarMode === "hidden"
    ? 0
    : sidebarMode === "compact"
    ? COMPACT_WIDTH
    : openWidth;

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const from: Paint = { mode: sidebarMode, width: modeWidth, ease: 0 };
    paintRef.current = from;
    startXRef.current = e.clientX;
    startWidthRef.current = modeWidth;
    setPaint(from);
    setIsResizing(true);
  }, [modeWidth, sidebarMode]);

  const effectiveWidth = paint?.width ?? modeWidth;
  const getEffectiveWidth = useCallback(() => effectiveWidth, [effectiveWidth]);

  /**
   * Precedence matters, and reads as the rule it enforces:
   *
   * 1. An owed ease wins — it is a deliberate, bounded animation.
   * 2. Otherwise a drag in progress gets **no** transition at all. This is the
   *    hard requirement: any easing here would put the panel edge behind the
   *    pointer for the whole gesture.
   * 3. Otherwise this is a programmatic mode change (rail, Cmd+\, keyboard,
   *    double-click) with no drag to follow, and it slides.
   */
  const widthTransition = easeMs > 0
    ? `width ${easeMs}ms ${COLLAPSE_EASING}`
    : isResizing || reducedMotion
    ? "none"
    : SIDEBAR_WIDTH_TRANSITION;

  return (
    <SidebarWidthContext.Provider
      value={{
        openWidth,
        minOpenWidth,
        maxOpenWidth,
        sidebarMode,
        dragZone: paint?.mode ?? null,
        isResizing,
        easeMs,
        widthTransition,
        getEffectiveWidth,
        startResize,
        setSidebarMode,
        stepSidebarMode,
        toggleSidebar,
        sidebarOpen: sidebarMode !== "hidden",
        isMobile,
      }}
    >
      {children}
    </SidebarWidthContext.Provider>
  );
};
