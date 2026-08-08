/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { type JSX, useEffect, useMemo } from "react";

import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import * as React from "react";

import { createTransformers } from "./MarkdownTransformers";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  PASTE_COMMAND,
  type PasteCommandType,
} from "lexical";
import { $convertFromMarkdownString } from ".";
import { $isCodeNode } from "@lexical/code";
import { $findMatchingParent } from "@lexical/utils";

export default function MarkdownPlugin(): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const transformers = useMemo(() => createTransformers(editor), [editor]);

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      // PASTE_COMMAND's payload is `PasteCommandType`
      // (ClipboardEvent | InputEvent | KeyboardEvent) and the payload type
      // became invariant in 0.49, so the narrowing moves into the body.
      (event: PasteCommandType) => {
        const clipboardData = "clipboardData" in event
          ? event.clipboardData
          : null;
        if (!clipboardData) return false;
        const html = clipboardData.getData("text/html");
        if (html) return false;
        const text = clipboardData.getData("text/plain");
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;

        // Check if we're inside a code block - if so, skip markdown conversion
        const anchorNode = selection.anchor.getNode();
        const codeNode = $findMatchingParent(anchorNode, $isCodeNode);
        if (codeNode !== null) {
          // We're inside a code block - let default paste behavior handle it
          return false;
        }

        const parent = $createParagraphNode();
        $setSelection(null);
        $convertFromMarkdownString(text, transformers, parent);
        const children = parent.getChildren();
        selection.insertNodes(children);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, transformers]);

  return <MarkdownShortcutPlugin transformers={transformers} />;
}
