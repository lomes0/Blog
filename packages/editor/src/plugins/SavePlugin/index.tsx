"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { COMMAND_PRIORITY_HIGH, KEY_MODIFIER_COMMAND } from "lexical";
import { useEffect } from "react";

export default function SavePlugin({ onSave }: { onSave?: () => void }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_MODIFIER_COMMAND,
      (event: KeyboardEvent) => {
        const { code, ctrlKey, metaKey, shiftKey } = event;

        // Check for Ctrl+S (or Cmd+S on Mac) without Shift
        if (code === "KeyS" && (ctrlKey || metaKey) && !shiftKey) {
          event.preventDefault();
          event.stopPropagation();

          // Call the onSave callback if provided
          if (onSave) {
            onSave();
          }

          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onSave]);

  return null;
}
