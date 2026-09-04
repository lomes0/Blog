"use client";
import React, { createContext, useContext, useState } from "react";
import {
  type ResizablePanelConfig,
  useResizablePanel,
} from "@/hooks/useResizablePanel";

/**
 * The right rail no longer has a mode.
 *
 * There used to be a `RailMode` of `"full" | "compact"` here, persisted under
 * `ui.railMode`. The panel is now one or two view slots and it is open iff a
 * slot is filled — see `components/Layout/RightRail/panelState.ts`. That made
 * the boolean not merely redundant but wrong: it could say "open" with nothing
 * to show, and closing the last view had to remember to flip it.
 *
 * The width below stays, because a width is not a mode: it is what the column
 * is when there is something in it.
 */
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
  /** User's preferred rail width, applied whenever the panel has a slot. */
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

  return (
    <LayoutModeContext.Provider
      value={{
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
