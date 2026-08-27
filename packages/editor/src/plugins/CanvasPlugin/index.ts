"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $insertNodes,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  LexicalCommand,
} from "lexical";
import { mergeRegister } from "@lexical/utils";
import { useEffect } from "react";

import {
  $createCanvasNode,
  CanvasNode,
  CanvasPayload,
} from "@/editor/nodes/CanvasNode";
import { registerBlockDecoratorUnwrap } from "@/editor/nodes/blockDecoratorUnwrap";

export type InsertCanvasPayload = Readonly<CanvasPayload>;

export const INSERT_CANVAS_COMMAND: LexicalCommand<
  InsertCanvasPayload | undefined
> = createCommand();

/**
 * **No `$wrapNodeInElement`** — see `NestedDocPlugin`, which has said why since
 * before this node could act on it. The node is block-level now
 * (docs/plans/nested-editor-support.md §3), so `$insertNodes` leaves it a block
 * in its own right; wrapping it would put its contents back beyond the reach of
 * an agent's addresses.
 */
export default function CanvasPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([CanvasNode])) {
      throw new Error("CanvasPlugin: CanvasNode not registered on editor");
    }

    return mergeRegister(
      editor.registerCommand<InsertCanvasPayload | undefined>(
        INSERT_CANVAS_COMMAND,
        (payload) => {
          const canvasNode = $createCanvasNode(payload);
          $insertNodes([canvasNode]);
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      registerBlockDecoratorUnwrap(editor, CanvasNode),
    );
  }, [editor]);

  return null;
}
