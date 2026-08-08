"use client";
import {
  $createParagraphNode,
  $insertNodes,
  $isRootOrShadowRoot,
  LexicalCommand,
} from "lexical";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $wrapNodeInElement } from "@lexical/utils";
import { COMMAND_PRIORITY_EDITOR, createCommand } from "lexical";
import { useEffect } from "react";

import {
  $createAttachmentNode,
  AttachmentNode,
  AttachmentPayload,
} from "@/editor/nodes/AttachmentNode";

export type InsertAttachmentPayload = Readonly<AttachmentPayload>;

export const INSERT_ATTACHMENT_COMMAND: LexicalCommand<
  InsertAttachmentPayload
> = createCommand();

export default function AttachmentPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([AttachmentNode])) {
      throw new Error(
        "AttachmentPlugin: AttachmentNode not registered on editor",
      );
    }

    return editor.registerCommand<InsertAttachmentPayload>(
      INSERT_ATTACHMENT_COMMAND,
      (payload) => {
        const attachmentNode = $createAttachmentNode(payload);
        $insertNodes([attachmentNode]);
        if ($isRootOrShadowRoot(attachmentNode.getParentOrThrow())) {
          $wrapNodeInElement(attachmentNode, $createParagraphNode).selectEnd();
        }
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  return null;
}
