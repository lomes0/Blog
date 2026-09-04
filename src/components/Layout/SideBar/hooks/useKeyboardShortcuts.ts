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

    // Ctrl/Cmd + B toggles the sidebar.
    //
    // It was `\` until the right panel grew slots and needed a split toggle.
    // `Cmd+\` is the split now, and this moved to `B` — which is what this
    // comment claimed for years while the code below read `\`, and what the
    // same chord does in every editor this app is shaped after.
    const isModifierPressed = event.ctrlKey || event.metaKey;

    if (isModifierPressed && event.key.toLowerCase() === "b") {
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
    shortcutHint: "Ctrl+B",
  };
};
