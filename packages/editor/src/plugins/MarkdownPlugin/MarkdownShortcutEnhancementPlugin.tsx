"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ENTER_COMMAND,
  KEY_SPACE_COMMAND,
  TextNode,
} from "lexical";
import { useEffect } from "react";
import { $createCodeNode } from "@lexical/code";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@/editor/nodes/HorizontalRuleNode";
import { $setBlocksType } from "@lexical/selection";

/**
 * Plugin to add keyboard shortcuts for markdown-style insertions:
 * - ``` (three backticks) + space/enter to create code block
 * - --- (three dashes) + space/enter to insert horizontal rule
 */
export default function MarkdownShortcutEnhancementPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent | null): boolean => {
      let handled = false;

      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return;
        }

        const anchor = selection.anchor;
        const anchorNode = anchor.getNode();

        // Only trigger on text nodes
        if (!(anchorNode instanceof TextNode)) {
          return;
        }

        const textContent = anchorNode.getTextContent();
        const offset = anchor.offset;
        const textBeforeCursor = textContent.substring(0, offset);

        // Check for ``` (code block)
        const codeBlockMatch = textBeforeCursor.match(/^```(\w*)$/);
        if (codeBlockMatch) {
          event?.preventDefault();

          const language = codeBlockMatch[1] || undefined;

          // Remove the trigger text
          anchorNode.setTextContent(
            textContent.substring(offset),
          );

          // Convert paragraph to code block
          $setBlocksType(selection, () => $createCodeNode(language));

          handled = true;
          return;
        }

        // Check for --- (horizontal rule)
        if (
          textBeforeCursor.match(/^(-{3,}|\*{3,}|_{3,}|={3,})$/)
        ) {
          event?.preventDefault();

          // Remove the trigger text
          const parent = anchorNode.getParent();
          if (parent) {
            parent.remove();
          }

          // Insert horizontal rule
          editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);

          handled = true;
          return;
        }
      });

      return handled;
    };

    // Register for both space and enter
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
