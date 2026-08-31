"use client";
import { createContext, ReactNode, useContext } from "react";

// Interface for a registered floating action button
export interface FloatingButtonInfo {
  id: string;
  element: ReactNode;
  priority: number;
}

// Context type for managing floating buttons
interface FloatingActionsContextType {
  registerButton: (id: string, element: ReactNode, priority?: number) => void;
  unregisterButton: (id: string) => void;
}

export const FloatingActionsContext = createContext<
  FloatingActionsContextType | null
>(null);

// Custom hook to use the floating actions context
export function useFloatingActions() {
  const context = useContext(FloatingActionsContext);
  if (!context) {
    throw new Error(
      "useFloatingActions must be used within a FloatingActionsProvider",
    );
  }
  return context;
}
