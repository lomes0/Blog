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
  COMPACT_WIDTH,
  type Landing,
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
  /** Current sidebar mode. Persisted separately from `openWidth`. */
  sidebarMode: SidebarMode;
  /**
   * The panel's width, in px. There is no drag-time variant: a drag previews
   * its destination and does not move the panel, so this changes exactly once
   * per gesture — on release.
   */
  sidebarWidth: number;
  /**
   * True when the width change happening right now must not animate. Set by a
   * drag release, whose destination the user has been looking at for the whole
   * gesture, and by `prefers-reduced-motion`.
   */
  noWidthMotion: boolean;
  /** Ready-made `transition` for anything that follows the panel's width. */
  widthTransition: string;
  /**
   * Apply a drag's landing. A no-op when it matches the current mode and width,
   * so a gesture that ends where it began writes no state and renders nothing.
   */
  commitResize: (landing: Landing) => void;
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

  // ── Whether the *last* width change came from a drag ──────────────────────
  // A drag release must land with no animation at all, and the width it writes
  // arrives in the same React update as this flag, so the render that moves the
  // panel is already the render that says "instantly".
  //
  // It is cleared by the programmatic setters rather than by a timer: they are
  // the only things that change the width afterwards, and each one clears the
  // flag in the same update as its own change, so *that* move animates. Between
  // a release and the next mode change nothing moves, so the value in between
  // is not observable — which is why no rAF or timeout is needed to unwind it.
  const [committedByDrag, setCommittedByDrag] = useState(false);

  const setSidebarMode = useCallback((mode: SidebarMode) => {
    setCommittedByDrag(false);
    setSidebarModeState(mode);
    localStorage.setItem(SIDEBAR_MODE_KEY, mode);
  }, []);

  const stepSidebarMode = useCallback((direction: 1 | -1) => {
    setCommittedByDrag(false);
    setSidebarModeState((prev) => {
      const next = MODE_LADDER[
        clamp(MODE_LADDER.indexOf(prev) + direction, 0, MODE_LADDER.length - 1)
      ];
      localStorage.setItem(SIDEBAR_MODE_KEY, next);
      return next;
    });
  }, []);

  const toggleSidebar = useCallback(() => {
    setCommittedByDrag(false);
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

  const sidebarWidth = sidebarMode === "hidden"
    ? 0
    : sidebarMode === "compact"
    ? COMPACT_WIDTH
    : openWidth;

  // Mirrored so `commitResize` can compare a landing against where the panel
  // already is without taking either as a dependency — the handle holds this
  // callback across a whole gesture and re-creating it mid-drag would leave the
  // pointer-up listener calling a stale one.
  const currentRef = useRef<Landing>({ mode: sidebarMode, width: sidebarWidth });
  currentRef.current = { mode: sidebarMode, width: sidebarWidth };

  const commitResize = useCallback((landing: Landing) => {
    const current = currentRef.current;
    // Released back where it started. The gesture was a look, not an edit, so
    // it writes nothing — no localStorage, no state, and therefore no render.
    if (landing.mode === current.mode && landing.width === current.width) {
      return;
    }

    setCommittedByDrag(true);
    // Only a landing in the open range rewrites the remembered width, which is
    // what makes collapsing non-destructive: drag the panel shut and back out
    // and it returns to the width you chose.
    if (landing.mode === "full") {
      setStoredWidth(landing.width);
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(landing.width));
    }
    setSidebarModeState(landing.mode);
    localStorage.setItem(SIDEBAR_MODE_KEY, landing.mode);
  }, []);

  const noWidthMotion = committedByDrag || reducedMotion;

  /**
   * A width change is either a drag landing on a destination the user has been
   * watching an outline of — instant, because animating towards a result
   * already on screen is pure lag — or a programmatic mode change with no
   * gesture behind it, which slides so the jump reads as one panel moving
   * rather than two panels swapping.
   */
  const widthTransition = noWidthMotion ? "none" : SIDEBAR_WIDTH_TRANSITION;

  return (
    <SidebarWidthContext.Provider
      value={{
        openWidth,
        minOpenWidth,
        maxOpenWidth,
        sidebarMode,
        sidebarWidth,
        noWidthMotion,
        widthTransition,
        commitResize,
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
