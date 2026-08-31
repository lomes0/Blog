"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $insertNodes,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type LexicalCommand,
} from "lexical";
import { useEffect } from "react";

import {
  $createNestedDocNode,
  NestedDocNode,
  type NestedDocPayload,
} from "@/editor/nodes/NestedDocNode";

type InsertNestedDocPayload = Readonly<NestedDocPayload>;

export const INSERT_NESTED_DOC_COMMAND: LexicalCommand<
  InsertNestedDocPayload | undefined
> = createCommand();

/**
 * Insertion for the nested doc.
 *
 * **No `$wrapNodeInElement`**, unlike `StickyPlugin` and `CanvasPlugin`. Those
 * wrap a root-level insert in a paragraph because their nodes are inline
 * decorators; a paragraph is not an addressable container
 * (docs/plans/archive/haklex-reprise.md §2.4), so wrapping is exactly what puts
 * a sticky's contents beyond the reach of an agent's addresses. `NestedDocNode`
 * returns `false` from `isInline()`, so `$insertNodes` leaves it a block in its
 * own right and it stays one. Adding a wrap here would silently undo the phase.
 */
export default function NestedDocPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([NestedDocNode])) {
      throw new Error("NestedDocPlugin: NestedDocNode not registered on editor");
    }

    return editor.registerCommand<InsertNestedDocPayload | undefined>(
      INSERT_NESTED_DOC_COMMAND,
      (payload) => {
        $insertNodes([$createNestedDocNode(payload)]);
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  return null;
}
