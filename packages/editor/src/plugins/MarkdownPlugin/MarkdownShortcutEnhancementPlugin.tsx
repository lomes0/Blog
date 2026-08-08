"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  COMMAND_PRIORITY_LOW,
  KEY_ENTER_COMMAND,
  KEY_SPACE_COMMAND,
} from "lexical";
import { useEffect } from "react";
import { $applyBlockShortcut } from "./blockShortcuts";

/**
 * Keyboard shortcuts for markdown-style block insertions:
 * - ``` (three backticks) + space/enter to create a code block
 * - --- (three dashes) + space/enter to insert a horizontal rule
 *
 * The logic itself is in `blockShortcuts.ts` so it can be exercised headlessly.
 */
export default function MarkdownShortcutEnhancementPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent | null): boolean => {
      let handled = false;
      editor.update(() => {
        handled = $applyBlockShortcut(editor, event);
      });
      return handled;
    };

    const removeSpaceCommand = editor.registerCommand(
      KEY_SPACE_COMMAND,
      handleShortcut,
      COMMAND_PRIORITY_LOW,
    );

    const removeEnterCommand = editor.registerCommand(
      KEY_ENTER_COMMAND,
      handleShortcut,
      COMMAND_PRIORITY_LOW,
    );

    return () => {
      removeSpaceCommand();
      removeEnterCommand();
    };
  }, [editor]);

  return null;
}
