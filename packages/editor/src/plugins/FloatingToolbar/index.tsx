"use client";
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { $isCodeHighlightNode } from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  LexicalEditor,
} from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getDOMRangeRect } from "@/editor/utils/getDOMRangeRect";
import { getSelectedNode } from "@/editor/utils/getSelectedNode";
import { useFloatingElemPosition } from "@/editor/utils/useFloatingElemPosition";
import TextFormatToggles from "../ToolbarPlugin/Tools/TextFormatToggles";
import { floatingToolbar } from "./styles.css";

function FloatingToolbar(
  { editor, anchorElem }: { editor: LexicalEditor; anchorElem: HTMLElement },
) {
  const popupCharStylesEditorRef = useRef<HTMLDivElement | null>(null);

  function mouseMoveListener(e: MouseEvent) {
    if (
      popupCharStylesEditorRef?.current &&
      (e.buttons === 1 || e.buttons === 3)
    ) {
      if (
        popupCharStylesEditorRef.current.style.pointerEvents !== "none"
      ) {
        const x = e.clientX;
        const y = e.clientY;
        const elementUnderMouse = document.elementFromPoint(x, y);

        if (
          !popupCharStylesEditorRef.current.contains(
            elementUnderMouse,
          )
        ) {
          // Mouse is not over the target element => not a normal click, but probably a drag
          popupCharStylesEditorRef.current.style.pointerEvents = "none";
        }
      }
    }
  }
  function mouseUpListener(_e: MouseEvent) {
    if (popupCharStylesEditorRef?.current) {
      if (
        popupCharStylesEditorRef.current.style.pointerEvents !== "auto"
      ) {
        popupCharStylesEditorRef.current.style.pointerEvents = "auto";
      }
    }
  }

  useEffect(() => {
    if (popupCharStylesEditorRef?.current) {
      document.addEventListener("mousemove", mouseMoveListener);
      document.addEventListener("mouseup", mouseUpListener);

      return () => {
        document.removeEventListener("mousemove", mouseMoveListener);
        document.removeEventListener("mouseup", mouseUpListener);
      };
    }
  }, [popupCharStylesEditorRef]);

  /**
   * The rect the toolbar points at: the current text range.
   *
   * `null` when there is nothing to point at — a collapsed selection, or one
   * whose anchor has left the editor — which the shared hook reads as "leave
   * the toolbar where it is". That is what this function did before it was one:
   * the old body simply returned early in the same cases.
   */
  const $selectionRect = useCallback((): DOMRect | null => {
    const selection = $getSelection();
    const nativeSelection = window.getSelection();
    const rootElement = editor.getRootElement();
    if (
      selection === null ||
      nativeSelection === null ||
      nativeSelection.isCollapsed ||
      rootElement === null ||
      !rootElement.contains(nativeSelection.anchorNode)
    ) {
      return null;
    }
    return getDOMRangeRect(nativeSelection, rootElement);
  }, [editor]);

  useFloatingElemPosition(
    editor,
    anchorElem,
    popupCharStylesEditorRef,
    $selectionRect,
  );

  return (
    <div
      className={`floating-toolbar ${floatingToolbar}`}
      ref={popupCharStylesEditorRef}
    >
      <TextFormatToggles editor={editor} />
    </div>
  );
}

function useFloatingToolbar(
  editor: LexicalEditor,
  anchorElem: HTMLElement,
) {
  const [isText, setIsText] = useState(false);

  const updatePopup = useCallback(() => {
    editor.getEditorState().read(() => {
      // Should not to pop up the floating toolbar when using IME input
      if (editor.isComposing()) {
        return;
      }
      const selection = $getSelection();
      const nativeSelection = window.getSelection();
      const rootElement = editor.getRootElement();

      if (
        nativeSelection !== null &&
        (!$isRangeSelection(selection) ||
          rootElement === null ||
          !rootElement.contains(nativeSelection.anchorNode))
      ) {
        setIsText(false);
        return;
      }

      if (!$isRangeSelection(selection)) {
        return;
      }

      const node = getSelectedNode(selection);

      if (
        !$isCodeHighlightNode(selection.anchor.getNode()) &&
        selection.getTextContent() !== ""
      ) {
        setIsText($isTextNode(node));
      } else {
        setIsText(false);
      }

      const rawTextContent = selection.getTextContent().replace(
        /\n/g,
        "",
      );
      if (!selection.isCollapsed() && rawTextContent === "") {
        setIsText(false);
        return;
      }
    });
  }, [editor]);

  useEffect(() => {
    document.addEventListener("selectionchange", updatePopup);
    return () => {
      document.removeEventListener("selectionchange", updatePopup);
    };
  }, [updatePopup]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(() => {
        updatePopup();
      }),
      editor.registerRootListener(() => {
        if (editor.getRootElement() === null) {
          setIsText(false);
        }
      }),
    );
  }, [editor, updatePopup]);

  if (!isText) {
    return null;
  }

  return createPortal(
    <FloatingToolbar editor={editor} anchorElem={anchorElem} />,
    anchorElem,
  );
}

export default function FloatingTextFormatToolbarPlugin({
  anchorElem = document.body,
}: {
  anchorElem?: HTMLElement;
}) {
  const [editor] = useLexicalComposerContext();
  return useFloatingToolbar(editor, anchorElem);
}
