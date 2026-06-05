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
