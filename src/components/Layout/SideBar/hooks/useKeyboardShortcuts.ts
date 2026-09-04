"use client";
import { useCallback, useEffect } from "react";

interface UseKeyboardShortcutsProps {
  onToggleSidebar: () => void;
  enabled?: boolean;
}

interface UseKeyboardShortcutsReturn {
  shortcutHint: string;
}

/**
 * Custom hook to handle keyboard shortcuts for the sidebar
 * Provides accessible keyboard navigation
 */
export const useKeyboardShortcuts = ({
  onToggleSidebar,
  enabled = true,
}: UseKeyboardShortcutsProps): UseKeyboardShortcutsReturn => {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Ctrl/Cmd + \ toggles the sidebar. (This comment said `B` for years
    // while the code below read `\`; the code is the shipped behaviour.)
    const isModifierPressed = event.ctrlKey || event.metaKey;

    if (isModifierPressed && event.key === "\\") {
      event.preventDefault();
      onToggleSidebar();
    }
  }, [onToggleSidebar, enabled]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown, enabled]);

  return {
    shortcutHint: "Ctrl+\\",
  };
};
