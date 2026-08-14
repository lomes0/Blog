"use client";
/**
 * Keep a floating element parked against something in the document.
 *
 * The positioning arithmetic is `setFloatingElemPosition` next door; this is
 * the other half of it — *when* to run it. Both were inside
 * `plugins/FloatingToolbar` and the second half was the part a new floating
 * surface would have had to copy: four listeners, in two effects, each of
 * which is silently optional until the one case it covers happens (the reader
 * scrolls, the window resizes, the content reflows above, the selection moves
 * inside the same element).
 *
 * The caller supplies the target as a function rather than a rect, because the
 * rect has to be read at the moment of positioning and inside the editor
 * state — a text selection resolves it through `getDOMRangeRect`, a figure
 * through `getElementByKey`. It is called inside `editorState.read`, hence the
 * `$` prefix, and it must be stable (`useCallback`) or every render
 * re-registers the listeners.
 *
 * Returning `null` from it means "nothing to point at, leave the element
 * alone". That is deliberately *not* the same as hiding it: the toolbars using
 * this unmount when there is nothing to point at, and repositioning to
 * `translate(-10000px, -10000px)` for one frame on the way out is how a
 * closing panel jumps across the screen before it disappears.
 */
import { mergeRegister } from "@lexical/utils";
import {
  COMMAND_PRIORITY_LOW,
  type LexicalEditor,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { type RefObject, useCallback, useEffect } from "react";
import { setFloatingElemPosition } from "./setFloatingElemPosition";

export function useFloatingElemPosition(
  editor: LexicalEditor,
  anchorElem: HTMLElement,
  floatingRef: RefObject<HTMLElement | null>,
  $targetRect: () => DOMRect | null,
): void {
  const reposition = useCallback(() => {
    const floatingElem = floatingRef.current;
    if (floatingElem === null) return;
    editor.getEditorState().read(() => {
      const rect = $targetRect();
      if (rect === null) return;
      setFloatingElemPosition(rect, floatingElem, anchorElem);
    });
  }, [editor, anchorElem, floatingRef, $targetRect]);

  useEffect(() => {
    // The scroller is the anchor's parent, the same element
    // `setFloatingElemPosition` clamps against — so the two agree about what
    // "the viewport" is even when the editor is in a pane rather than a page.
    const scrollerElem = anchorElem.parentElement;
    reposition();
    window.addEventListener("resize", reposition);
    scrollerElem?.addEventListener("scroll", reposition);
    return () => {
      window.removeEventListener("resize", reposition);
      scrollerElem?.removeEventListener("scroll", reposition);
    };
  }, [anchorElem, reposition]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(() => {
        reposition();
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          reposition();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, reposition]);
}
