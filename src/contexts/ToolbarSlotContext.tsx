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
 * the slot is no longer singular: the app shell keeps one for the routes that
 * mount a lone editor (Playground, Tutorial), and each workspace pane nests its
 * own provider so its editors portal into its own header instead of into the
 * window's. Both do the identical two things, and doing them in one place is
 * what keeps a second slot from being wired up subtly differently.
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
