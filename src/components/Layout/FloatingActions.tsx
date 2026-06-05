"use client";
import { FloatingActionsContainer } from "./FloatingActionsContainer";
import { ReactNode } from "react";

export function FloatingActionsProvider({ children }: { children: ReactNode }) {
  return (
    <FloatingActionsContainer>
      {children}
    </FloatingActionsContainer>
  );
}
