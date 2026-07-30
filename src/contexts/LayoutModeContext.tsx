"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  type ResizablePanelConfig,
  useResizablePanel,
} from "@/hooks/useResizablePanel";

/**
 * The right rail's two states.
 *
 * Deliberately *not* the sidebar's `SidebarMode` even though that union used to
 * be spelled identically here: the rail has no hidden state. Its compact strip
 * is the app's permanent right border — the thing the collapse button collapses
 * *to* — so "hidden" was unreachable (`toggleRail` only ever flipped
 * full ↔ compact) and the two consumers disagreed about what it would mean:
 * `RightRail` rendered nothing while `AppLayoutContent` still reserved the 54px
 * column. An identical shape is not the same concept; three modes that all
 * happen and two that do are different types, and this one is now honest about
 * which it is.
 */
export type RailMode = "full" | "compact";

const RAIL_MODE_KEY = "ui.railMode";

/** Width of the always-present compact strip on the rail's right edge. */
export const RAIL_COMPACT_W = 54;

/**
 * Per-panel geometry. These triples used to be six loose exports, five of which
 * nothing outside this file read; they belong to the panel they configure, not
 * to the module. The sidebar's equivalents stay in
 * `components/Layout/SideBar/constants.ts` because they are not just numbers —
 * that file documents a detent and a spring the values are derived from.
 *
 * The storage keys are load-bearing: changing one silently resets every existing
 * user's layout to the default.
 */
const RAIL_PANEL: ResizablePanelConfig = {
  storageKey: "ui.railWidth",
  defaultWidth: 280,
  minWidth: 180,
  maxWidth: 520,
};

const COPILOT_PANEL: ResizablePanelConfig = {
  storageKey: "ui.copilotWidth",
  defaultWidth: 380,
  minWidth: 320,
  maxWidth: 640,
};

interface LayoutModeContextType {
  railMode: RailMode;
  toggleRail: () => void;
  /** User's preferred rail width (full mode only) */
  railWidth: number;
  /** Whether the user is currently dragging the rail resize handle */
  isRailResizing: boolean;
  /** Start a rail resize drag */
  startRailResize: (e: React.MouseEvent) => void;
  /** Whether the Copilot panel is showing */
  copilotOpen: boolean;
  /**
   * Show/hide the Copilot panel. A setter rather than a toggle because the
   * panel's own close button must mean *close*: it stays mounted through the
   * 225ms clip-out, so a second click on a toggle would reopen it.
   */
  setCopilotOpen: (open: boolean) => void;
  /** User's preferred Copilot panel width */
  copilotWidth: number;
  /** Whether the user is currently dragging the Copilot resize handle */
  isCopilotResizing: boolean;
  /** Start a Copilot panel resize drag */
  startCopilotResize: (e: React.MouseEvent) => void;
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
  // Copilot visibility lives here rather than in the Redux `ui` slice, where it
  // used to sit apart from its own width: a panel's open state and its width are
  // one decision (the grid column is `open ? width : 0`), and splitting them
  // across two stores meant every consumer subscribed to both. Nothing outside
  // the layout reads it and no thunk touches it, so the store is not the right
  // home; the widths in particular update per mousemove frame, which is a
  // dispatch-per-frame if they move the other way. Not persisted — same as
  // before, the panel opens closed.
  const [copilotOpen, setCopilotOpen] = useState(false);
  const rail = useResizablePanel(RAIL_PANEL);
  const copilot = useResizablePanel(COPILOT_PANEL);

  useEffect(() => {
    const saved = localStorage.getItem(RAIL_MODE_KEY);
    // "hidden" is a value older builds could write. It survives only as this
    // migration; see `RailMode` above.
    if (saved === "full" || saved === "compact") setRailMode(saved);
    else if (saved === "hidden") setRailMode("compact");
  }, []);

  const toggleRail = useCallback(() => {
    setRailMode((prev) => {
      const next = prev === "full" ? "compact" : "full";
      localStorage.setItem(RAIL_MODE_KEY, next);
      return next;
    });
  }, []);

  return (
    <LayoutModeContext.Provider
      value={{
        railMode,
        toggleRail,
        railWidth: rail.width,
        isRailResizing: rail.isResizing,
        startRailResize: rail.startResize,
        copilotOpen,
        setCopilotOpen,
        copilotWidth: copilot.width,
        isCopilotResizing: copilot.isResizing,
        startCopilotResize: copilot.startResize,
      }}
    >
      {children}
    </LayoutModeContext.Provider>
  );
};
