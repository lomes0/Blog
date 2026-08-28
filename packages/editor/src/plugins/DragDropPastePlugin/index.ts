"use client";
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { DRAG_DROP_PASTE } from "@lexical/rich-text";
import { isMimeType, mediaFileReader } from "@lexical/utils";
import { COMMAND_PRIORITY_LOW } from "lexical";
import { useEffect } from "react";

import { INSERT_IMAGE_COMMAND } from "../ImagePlugin";
import { getImageDimensions } from "@/editor/nodes/utils";
import { ANNOUNCE_COMMAND } from "@/editor/commands";
import { blobSrcOrFallback } from "@/editor/utils/uploadBlob";
import { useEditorDocumentId } from "@/editor/context/DocumentContext";

const ACCEPTABLE_IMAGE_TYPES = [
  "image/",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/webp",
];

export default function DragDropPaste(): null {
  const [editor] = useLexicalComposerContext();
  // This editor's document, not the focused one: in a split both are mounted,
  // and a paste into the unfocused pane must land on the document under it.
  const documentId = useEditorDocumentId();
  useEffect(() => {
    return editor.registerCommand(
      DRAG_DROP_PASTE,
      (files) => {
        (async () => {
          const filesResult = await mediaFileReader(
            files,
            [ACCEPTABLE_IMAGE_TYPES].flatMap((x) => x),
          );
          for (const { file, result } of filesResult) {
            if (isMimeType(file, ACCEPTABLE_IMAGE_TYPES)) {
              // Dimensions still come from the data URI: it is already in hand,
              // and measuring it needs no network. Only `src` changes — to a
              // blob URL when the bytes could be stored, and otherwise to the
              // same data URI as before (blob-storage.md §6).
              const dimensions = await getImageDimensions(result);
              const src = await blobSrcOrFallback(file, result, documentId);
              // Scale pasted images to 50% of their original size
              const scaledDimensions = {
                width: Math.round(dimensions.width * 0.35),
                height: Math.round(dimensions.height * 0.5),
              };
              editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
                src,
                altText: file.name.replace(/\.[^/.]+$/, ""),
                showCaption: true,
                ...scaledDimensions,
                id: "",
                style: "",
              });
            } else {
              editor.dispatchCommand(ANNOUNCE_COMMAND, {
                message: {
                  title: "Uploading image failed",
                  subtitle: "Unsupported file type",
                },
              });
            }
          }
        })();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, documentId]);
  return null;
}
