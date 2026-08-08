"use client";
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $insertNodes,
  $isRootNode,
  LexicalCommand,
} from "lexical";
import { useEffect } from "react";
import { $wrapNodeInElement, mergeRegister } from "@lexical/utils";
import {
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  createCommand,
  DRAGOVER_COMMAND,
  DRAGSTART_COMMAND,
  DROP_COMMAND,
} from "lexical";

import {
  $createKanbanNode,
  $isKanbanNode,
  KanbanNode,
  KanbanPayload,
} from "@/editor/nodes/KanbanNode";

export type InsertKanbanPayload = Readonly<KanbanPayload>;

export const INSERT_KANBAN_COMMAND: LexicalCommand<
  InsertKanbanPayload | undefined
> = createCommand();

export default function KanbanPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([KanbanNode])) {
      throw new Error(
        "KanbanPlugin: KanbanNode not registered on editor",
      );
    }

    return mergeRegister(
      editor.registerCommand<InsertKanbanPayload | undefined>(
        INSERT_KANBAN_COMMAND,
        (payload) => {
          const kanbanNode = $createKanbanNode(payload);
          $insertNodes([kanbanNode]);
          if ($isRootNode(kanbanNode.getParentOrThrow())) {
            $wrapNodeInElement(kanbanNode, $createParagraphNode).selectEnd();
          }

          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand<DragEvent>(
        DRAGSTART_COMMAND,
        (event) => {
          const node = $getNodeByDOMTarget(event.target);
          if (!$isKanbanNode(node)) {
            return false;
          }
          if (event.dataTransfer) {
            event.dataTransfer.setData("text/plain", "_");
          }
          event.dataTransfer!.effectAllowed = "move";

          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand<DragEvent>(
        DRAGOVER_COMMAND,
        (event) => {
          const node = $getNodeByDOMTarget(event.target);
          if (!$isKanbanNode(node)) {
            return false;
          }
          if (!canDropImage(event)) {
            event.preventDefault();
          }
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<DragEvent>(
        DROP_COMMAND,
        (event) => {
          const node = $getNodeByDOMTarget(event.target);
          if (!$isKanbanNode(node)) {
            return false;
          }
          if (!canDropImage(event)) {
            event.preventDefault();
          }
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor]);

  return null;
}

function $getNodeByDOMTarget(target: EventTarget | null): KanbanNode | null {
  if (!target || !(target instanceof Element)) {
    return null;
  }

  // Try to find the kanban node in the DOM tree
  let element: Element | null = target;
  while (element) {
    if (element.hasAttribute("data-lexical-kanban")) {
      // This is a basic implementation - in a real scenario you'd need to properly
      // get the lexical node from the DOM element
      return null; // Simplified for now
    }
    element = element.parentElement;
  }

  return null;
}

function canDropImage(event: DragEvent): boolean {
  const target = event.target;
  return !!(
    target &&
    target instanceof HTMLElement &&
    !target.closest("code, span.editor-image") &&
    target.parentElement &&
    target.parentElement.closest("div.ContentEditable__root")
  );
}
