"use client";
import React, { createContext, useCallback, useContext, useState } from "react";

interface ToolbarSlotContextType {
  slotEl: HTMLDivElement | null;
  setSlotEl: (el: HTMLDivElement | null) => void;
}

const ToolbarSlotContext = createContext<ToolbarSlotContextType | undefined>(
  undefined,
);

export const useToolbarSlot = () => {
  const ctx = useContext(ToolbarSlotContext);
  if (!ctx) {
    throw new Error(
      "useToolbarSlot must be used within ToolbarSlotProvider",
    );
  }
  return ctx;
};

/**
 * Where the toolbar lands. Renders the element the nearest provider hands to
 * `ToolbarPlugin`'s portal.
 *
 * A component rather than a bare `ref={setSlotEl}` at each call site because
 * the workspace draws its target from two places — `WorkspaceToolbar` above a
 * split's pane row, and `TabbedDocumentEditor` in the lone pane's header — and
 * both do the identical two things. Doing them in one place is what keeps the
 * second site from being wired up subtly differently.
 *
 * The app shell used to keep a provider of its own, for the routes that mounted
 * a lone editor outside the workspace (`/playground`, `/tutorial`). Both are
 * gone, so `WorkspacePanes` now holds the only provider in the tree.
 *
 * Within a provider the slot *is* singular: two targets would both write
 * `slotEl` and the last to mount would take the toolbar. The workspace draws
 * exactly one — in the lone pane's header, or above a split's pane row.
 */
export const ToolbarSlotTarget: React.FC<
  { style?: React.CSSProperties }
> = ({ style }) => {
  const { setSlotEl } = useToolbarSlot();
  return <div ref={setSlotEl} style={style} />;
};

export const ToolbarSlotProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [slotEl, setSlotElState] = useState<HTMLDivElement | null>(null);
  const setSlotEl = useCallback(
    (el: HTMLDivElement | null) => setSlotElState(el),
    [],
  );
  return (
    <ToolbarSlotContext.Provider value={{ slotEl, setSlotEl }}>
      {children}
    </ToolbarSlotContext.Provider>
  );
};
