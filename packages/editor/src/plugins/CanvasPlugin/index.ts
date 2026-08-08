"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $insertNodes,
  $isRootNode,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  LexicalCommand,
} from "lexical";
import { useEffect } from "react";
import { $wrapNodeInElement } from "@lexical/utils";

import {
  $createCanvasNode,
  CanvasNode,
  CanvasPayload,
} from "@/editor/nodes/CanvasNode";

export type InsertCanvasPayload = Readonly<CanvasPayload>;

export const INSERT_CANVAS_COMMAND: LexicalCommand<
  InsertCanvasPayload | undefined
> = createCommand();

export default function CanvasPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([CanvasNode])) {
      throw new Error("CanvasPlugin: CanvasNode not registered on editor");
    }

    return editor.registerCommand<InsertCanvasPayload | undefined>(
      INSERT_CANVAS_COMMAND,
      (payload) => {
        const canvasNode = $createCanvasNode(payload);
        $insertNodes([canvasNode]);
        if ($isRootNode(canvasNode.getParentOrThrow())) {
          $wrapNodeInElement(canvasNode, $createParagraphNode).selectEnd();
        }
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  return null;
}
