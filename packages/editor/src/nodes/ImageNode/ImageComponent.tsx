"use client";
/* eslint-disable @next/next/no-img-element */
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  $isRangeSelection,
  $setSelection,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  LexicalEditor,
  NodeKey,
} from "lexical";

import "./index.css";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { mergeRegister } from "@lexical/utils";
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DRAGSTART_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";

import ImageResizer from "./ImageResizer";
import ImageCaption from "./ImageCaption";
import { $isImageNode } from ".";
import { $patchStyle } from "../utils";
import { percentFromPixels, widthPatch } from "../imageLayout";

export default function ImageComponent({
  src,
  altText,
  nodeKey,
  width,
  height,
  showCaption,
  caption,
  element = "img",
  children,
}: {
  altText: string;
  height: number;
  nodeKey: NodeKey;
  src: string;
  width: number;
  showCaption: boolean;
  caption: LexicalEditor;
  element?: "img" | "iframe" | "svg";
  children?: React.ReactNode;
}) {
  const imageRef = useRef<
    HTMLImageElement | HTMLIFrameElement | SVGSVGElement
  >(null);
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(
    nodeKey,
  );
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [editor] = useLexicalComposerContext();

  // KEY_ENTER_COMMAND's payload is `KeyboardEvent | null` — Lexical dispatches
  // it with null from programmatic paths — and the command payload type became
  // invariant in 0.49, so the handler must accept the null.
  const $onEnter = useCallback(
    (event: KeyboardEvent | null) => {
      const latestSelection = $getSelection();
      if (
        isSelected &&
        $isNodeSelection(latestSelection) &&
        latestSelection.getNodes().length === 1
      ) {
        if (showCaption) {
          // Move focus into nested editor
          $setSelection(null);
          event?.preventDefault();
          caption.focus();
          return true;
        }
      }
      return false;
    },
    [caption, isSelected, showCaption],
  );

  const $onEscape = useCallback(
    (event: KeyboardEvent) => {
      if (event.currentTarget === caption._rootElement) {
        caption.update(() => {
          $setSelection(null);
        });
        setSelected(true);
        return true;
      }
      return false;
    },
    [caption, setSelected],
  );

  const $onDelete = useCallback(
    (payload: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        const event: KeyboardEvent = payload;
        event.preventDefault();
        const node = $getNodeByKey(nodeKey);
        if ($isImageNode(node)) {
          node.selectPrevious();
          node.remove();
          return true;
        }
      }
      return false;
    },
    [isSelected, nodeKey],
  );

  const onClick = useCallback(
    (payload: MouseEvent) => {
      const event = payload;

      if (isResizing) {
        return true;
      }
      if (
        imageRef.current &&
        imageRef.current.contains(event.target as Node)
      ) {
        caption.update(() => {
          $setSelection(null);
        });
        if (event.shiftKey) {
          setSelected(!isSelected);
        } else {
          clearSelection();
          setSelected(true);
        }
        return true;
      }

      return false;
    },
    [isResizing, isSelected, setSelected, clearSelection, caption],
  );

  useEffect(() => {
    const unregister = mergeRegister(
      editor.registerCommand<MouseEvent>(
        CLICK_COMMAND,
        onClick,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        DRAGSTART_COMMAND,
        (event) => {
          if (event.target === imageRef.current) {
            // TODO This is just a temporary workaround for FF to behave like other browsers.
            // Ideally, this handles drag & drop too (and all browsers).
            event.preventDefault();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        $onDelete,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        $onDelete,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        $onEnter,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        $onEscape,
        COMMAND_PRIORITY_LOW,
      ),
    );

    return () => {
      unregister();
    };
  }, [
    clearSelection,
    editor,
    isResizing,
    isSelected,
    nodeKey,
    $onDelete,
    $onEnter,
    $onEscape,
    onClick,
    setSelected,
  ]);

  /**
   * The width a percentage resolves against: the figure's **containing
   * block**, not the figure.
   *
   * `createDOM` builds a `<figure>` and everything here renders inside it, so
   * the nearest `figure` ancestor is this node's own box and its parent is
   * what `width: N%` is a percentage of. Measured at commit rather than held
   * in state because it changes with the window, with the sidebar, and with a
   * pane split — and the only moment it has to be right is this one.
   */
  const containingBlockWidth = (): number => {
    const figure = imageRef.current?.closest("figure");
    const parent = figure?.parentElement;
    return parent ? parent.getBoundingClientRect().width : 0;
  };

  const onResizeEnd = (
    nextWidth: number,
    nextHeight: number,
  ) => {
    // Delay hiding the resize bars for click case
    setTimeout(() => {
      setIsResizing(false);
    }, 200);

    const container = containingBlockWidth();

    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!$isImageNode(node)) return;

      // The drag is pixels either way — `getBoundingClientRect` in,
      // `style.width = Npx` out. What the node's class decides is the unit the
      // *commit* is written in, which is a property of what the figure holds:
      // a picture scales, a GeoGebra applet and an embed do not. See
      // `imageLayout.ts`'s `ImageResizeUnit`.
      const percent = node.getResizeUnit() === "percent"
        ? percentFromPixels(nextWidth, container)
        : null;

      // `__width`/`__height` are written in both modes, and they are not the
      // competitor to the percent that they look like: for a percent-sized
      // figure the stylesheet gives the picture `width: 100%; height: auto`,
      // so the pair survives only as the `aspect-ratio` the picture is drawn
      // at — which is exactly what a vertical drag changes and what `Auto`
      // must be able to come back to. It is also what makes the imperative
      // `style.width` the drag left behind get cleared: the effect below fires
      // on a change to either.
      node.setWidthAndHeight(nextWidth, nextHeight);

      // Percent: the drag *states* a display width, in the same channel the
      // slider writes. Pixels: the drag states an absolute size, so it clears
      // any percent rather than fighting it — keeping one would mean the
      // figure snapped back the moment the drag committed, which is the one
      // outcome nobody would call correct.
      //
      // A `null` percent from a container that has not been laid out is the
      // pixel answer too: better a size the reader dragged than a percentage
      // of nothing.
      //
      // The *alignment* survives in both. It is not a size.
      $patchStyle(node, widthPatch(percent));
    });
  };

  const onResizeStart = () => {
    setIsResizing(true);
  };

  /**
   * Drop the imperative size the resize drag left behind, once the committed
   * one has rendered.
   *
   * `ImageResizer` writes `style.width` straight onto the picture during a drag
   * and does not clear it on release — deliberately, because the node's new
   * width has not reached the `width` attribute yet and clearing early would
   * flash the old size. Nothing ever removed it afterwards, which was harmless
   * while pixels were the only vocabulary: the leftover always agreed with the
   * attribute beside it. It stops being harmless with percent widths, because
   * an inline `width: 620px` on the picture outranks the stylesheet rule that
   * stretches it to a percent-sized figure — so a drag would quietly disable
   * the width control for the rest of the session.
   *
   * Running on the committed `width`/`height` is what makes it safe: by then
   * React has rendered the new attributes, so there is nothing to flash to.
   */
  useEffect(() => {
    const element = imageRef.current;
    if (!element) return;
    element.style.removeProperty("width");
    element.style.removeProperty("height");
  }, [width, height]);

  const onLoad = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        const scrollTop = Math.round(
          document.documentElement.scrollTop,
        );
        const rootElement = editor.getRootElement();
        rootElement?.focus();
        document.documentElement.scrollTop = scrollTop;
        const nativeSelection = window.getSelection();
        nativeSelection?.removeAllRanges();
        const element = imageRef.current;
        element?.scrollIntoView({ block: "nearest" });
      }
    });
  }, [editor]);

  const [draggable, setDraggable] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (isSelected) onLoad();
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      const isDraggable = isSelected && $isNodeSelection(selection) &&
        !isResizing;
      const isFocused = $isNodeSelection(selection) &&
        (isSelected || isResizing);
      setDraggable(isDraggable);
      setFocused(isFocused);
    });
  }, [isSelected, editor, isResizing, onLoad]);

  useEffect(() => {
    if (!imageRef.current) return;
    if (element === "svg") {
      const isBase64 = src.startsWith("data:image/svg+xml;base64");
      const decoded = isBase64
        ? atob(src.split(",")[1])
        : decodeURIComponent(src.split(",")[1]);
      const string = decoded.replace(
        /<!-- payload-start -->\s*(.+?)\s*<!-- payload-end -->/,
        "",
      );
      const svg = new DOMParser().parseFromString(string, "image/svg+xml")
        .documentElement;
      const styles = svg.querySelectorAll("style");
      styles.forEach((style) => {
        style.remove();
      });
      const viewBox = svg.getAttribute("viewBox");
      const svgWidth = svg.getAttribute("width");
      const svgHeight = svg.getAttribute("height");
      imageRef.current.setAttribute(
        "viewBox",
        viewBox ? viewBox : `0 0 ${svgWidth} ${svgHeight}`,
      );
      if (!width && svgWidth) {
        imageRef.current.setAttribute("width", svgWidth);
      }
      if (!height && svgHeight) {
        imageRef.current.setAttribute("height", svgHeight);
      }
      imageRef.current.innerHTML = svg.innerHTML;
    }
  }, [imageRef, src, element, height, width]);

  return (
    <>
      <ImageResizer
        editor={editor}
        imageRef={imageRef}
        onResizeStart={onResizeStart}
        onResizeEnd={onResizeEnd}
        showResizers={focused}
      >
        {element === "svg" && (
          <svg
            ref={imageRef as React.Ref<SVGSVGElement>}
            width={width || undefined}
            height={height || undefined}
            xmlns="http://www.w3.org/2000/svg"
            version="1.1"
          />
        )}
        {element === "iframe" && (
          <iframe
            ref={imageRef as React.Ref<HTMLIFrameElement>}
            width={width}
            height={height}
            src={src}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen={true}
            title={altText}
          />
        )}
        <img
          className={focused ? `draggable` : undefined}
          src={src}
          alt={altText}
          draggable={draggable}
          ref={element === "img"
            ? imageRef as React.Ref<HTMLImageElement>
            : undefined}
          width={width || undefined}
          height={height || undefined}
          style={element === "img"
            ? { aspectRatio: (width / height) || undefined }
            : {
              aspectRatio: (width / height) || undefined,
              position: "absolute",
              opacity: 0,
              pointerEvents: focused ? "auto" : "none",
            }}
        />
      </ImageResizer>
      {showCaption && (
        <ImageCaption editor={caption} nodeKey={nodeKey}>
          {children}
        </ImageCaption>
      )}
    </>
  );
}
