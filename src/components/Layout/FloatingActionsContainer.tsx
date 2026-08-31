"use client";
import React, {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Box } from "@mui/material";
import {
  FloatingActionsContext,
  FloatingButtonInfo,
  useFloatingActions,
} from "@/contexts/FloatingActionsContext";

export function FloatingActionsContainer(
  { children }: { children: ReactNode },
) {
  const [buttons, setButtons] = useState<FloatingButtonInfo[]>([]);
  const isMountedRef = useRef(true);

  // Use effect to handle unmounting
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Register a new floating action button
  const registerButton = useCallback(
    (id: string, element: ReactNode, priority = 0) => {
      if (isMountedRef.current) {
        setButtons((prev) => {
          // Remove the button if it already exists to avoid duplicates
          const filtered = prev.filter((btn) => btn.id !== id);
          return [...filtered, { id, element, priority }];
        });
      }
    },
    [],
  );

  // Unregister a floating action button
  const unregisterButton = useCallback((id: string) => {
    if (isMountedRef.current) {
      setButtons((prev) => prev.filter((btn) => btn.id !== id));
    }
  }, []);

  // Sort buttons by priority
  const sortedButtons = [...buttons].sort((a, b) => b.priority - a.priority);

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = React.useMemo(() => ({
    registerButton,
    unregisterButton,
  }), [registerButton, unregisterButton]);

  return (
    <FloatingActionsContext.Provider value={contextValue}>
      {children}
      <Box
        aria-label="Floating action buttons"
        role="region"
        sx={{
          position: "fixed",
          bottom: 16,
          right: 16,
          display: "flex",
          flexDirection: "column",
          gap: 2, // 16px spacing between buttons
          alignItems: "flex-end",
          zIndex: 1200, // Higher z-index to appear above most elements
          pointerEvents: "none", // Allow clicking through the container itself
          "& > *": {
            pointerEvents: "auto", // Restore pointer events for buttons
          },
          // Responsive adjustments
          "@media (max-width: 600px)": {
            bottom: 8,
            right: 8,
            gap: 1.5, // Slightly smaller gap on mobile
          },
        }}
      >
        {sortedButtons.map((button) => (
          <Box key={button.id}>
            {button.element}
          </Box>
        ))}
      </Box>
    </FloatingActionsContext.Provider>
  );
}

// Wrapper component for floating action buttons
export function FloatingActionButton({
  id,
  children,
  priority = 0,
}: {
  id: string;
  children: ReactNode;
  priority?: number;
}) {
  const { registerButton, unregisterButton } = useFloatingActions();

  // Use a ref to store the latest children to avoid unnecessary re-renders
  const childrenRef = useRef(children);
  useEffect(() => {
    childrenRef.current = children;
  }, [children]);

  // This effect handles registration and cleanup
  useEffect(() => {
    // Register the button with the current properties
    registerButton(id, childrenRef.current, priority);

    // Return cleanup function that unregisters the button
    return () => {
      unregisterButton(id);
    };
    // Only re-run if id or priority changes, not on every render when children changes
    // registerButton and unregisterButton are memoized so they won't cause re-renders
  }, [id, priority, registerButton, unregisterButton]);

  return null; // This component doesn't render anything itself
}
