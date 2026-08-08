/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { LexicalEditor } from "lexical";

import { calculateZoomLevel } from "@lexical/utils";
import * as React from "react";
import { useRef } from "react";
import { cx } from "../../ui";
import { resizeHandle } from "./styles.css";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * One resize grip.
 *
 * Was `<Radio checked>`, a MUI radio rendered purely for its dot; the
 * `.image-resizer` rules in `index.css` then had to undo its icon and its
 * padding. `handlePointerDown` already typed its event as
 * `React.PointerEvent<HTMLButtonElement>` because `Radio` is a `ButtonBase`
 * underneath, so the pointer plumbing is unchanged.
 *
 * Not focusable, and hidden from assistive tech: there is no keyboard resize,
 * so the eight radio inputs this replaces were eight tab stops that did
 * nothing. Upstream Lexical's playground renders these as plain `<div>`s for
 * the same reason; a `<button>` is the closest focusable-by-default element,
 * so it opts out explicitly.
 */
function Handle({
  corner,
  onPointerDown,
}: {
  corner: "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-hidden="true"
      tabIndex={-1}
      className={cx(resizeHandle, "image-resizer", `image-resizer-${corner}`)}
      onPointerDown={onPointerDown}
    />
  );
}

const Direction = {
  east: 1 << 0,
  north: 1 << 3,
  south: 1 << 1,
  west: 1 << 2,
};

export default function ImageResizer({
  onResizeStart,
  onResizeEnd,
  imageRef,
  maxWidth,
  editor,
  children,
  showResizers,
}: {
  editor: LexicalEditor;
  imageRef: React.RefObject<
    HTMLImageElement | HTMLIFrameElement | SVGSVGElement | null
  >;
  maxWidth?: number;
  onResizeEnd: (width: number, height: number) => void;
  onResizeStart: () => void;
  children: React.ReactNode;
  showResizers: boolean;
}) {
  const controlWrapperRef = useRef<HTMLDivElement>(null);
  const userSelect = useRef({
    priority: "",
    value: "default",
  });
  const positioningRef = useRef<{
    currentHeight: number;
    currentWidth: number;
    direction: number;
    isResizing: boolean;
    ratio: number;
    startHeight: number;
    startWidth: number;
    startX: number;
    startY: number;
  }>({
    currentHeight: 0,
    currentWidth: 0,
    direction: 0,
    isResizing: false,
    ratio: 0,
    startHeight: 0,
    startWidth: 0,
    startX: 0,
    startY: 0,
  });
  const editorRootElement = editor.getRootElement();
  // Find max width, accounting for editor padding.
  const maxWidthContainer = maxWidth
    ? maxWidth
    : editorRootElement !== null
    ? editorRootElement.getBoundingClientRect().width - 20
    : 40;
  const maxHeightContainer = editorRootElement !== null
    ? editorRootElement.getBoundingClientRect().height - 20
    : 40;

  const minWidth = 40;
  const minHeight = 40;

  const setStartCursor = (direction: number) => {
    const ew = direction === Direction.east || direction === Direction.west;
    const ns = direction === Direction.north ||
      direction === Direction.south;
    const nwse = (direction & Direction.north && direction & Direction.west) ||
      (direction & Direction.south && direction & Direction.east);

    const cursorDir = ew ? "ew" : ns ? "ns" : nwse ? "nwse" : "nesw";

    if (editorRootElement !== null) {
      editorRootElement.style.setProperty(
        "cursor",
        `${cursorDir}-resize`,
        "important",
      );
    }
    if (document.body !== null) {
      document.body.style.setProperty(
        "cursor",
        `${cursorDir}-resize`,
        "important",
      );
      userSelect.current.value = document.body.style.getPropertyValue(
        "-webkit-user-select",
      );
      userSelect.current.priority = document.body.style
        .getPropertyPriority(
          "-webkit-user-select",
        );
      document.body.style.setProperty(
        "-webkit-user-select",
        `none`,
        "important",
      );
    }
  };

  const setEndCursor = () => {
    if (editorRootElement !== null) {
      editorRootElement.style.setProperty("cursor", "text");
    }
    if (document.body !== null) {
      document.body.style.setProperty("cursor", "default");
      document.body.style.setProperty(
        "-webkit-user-select",
        userSelect.current.value,
        userSelect.current.priority,
      );
    }
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    direction: number,
  ) => {
    if (!editor.isEditable()) {
      return;
    }

    const image = imageRef.current;
    const controlWrapper = controlWrapperRef.current;

    if (image !== null && controlWrapper !== null) {
      event.preventDefault();
      const { width, height } = image.getBoundingClientRect();
      const zoom = calculateZoomLevel(image);
      const positioning = positioningRef.current;
      positioning.startWidth = width;
      positioning.startHeight = height;
      positioning.ratio = width / height;
      positioning.currentWidth = width;
      positioning.currentHeight = height;
      positioning.startX = event.clientX / zoom;
      positioning.startY = event.clientY / zoom;
      positioning.isResizing = true;
      positioning.direction = direction;

      setStartCursor(direction);
      onResizeStart();

      controlWrapper.classList.add("image-control-wrapper--resizing");
      image.style.height = `${height}px`;
      image.style.width = `${width}px`;

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    }
  };
  const handlePointerMove = (event: PointerEvent) => {
    const image = imageRef.current;
    const positioning = positioningRef.current;

    const isHorizontal = positioning.direction &
      (Direction.east | Direction.west);
    const isVertical = positioning.direction &
      (Direction.south | Direction.north);

    if (image !== null && positioning.isResizing) {
      const zoom = calculateZoomLevel(image);
      // Corner cursor
      if (isHorizontal && isVertical) {
        let diff = Math.floor(
          positioning.startX - event.clientX / zoom,
        );
        diff = positioning.direction & Direction.east ? -diff : diff;

        const width = clamp(
          positioning.startWidth + diff,
          minWidth,
          maxWidthContainer,
        );

        const height = width / positioning.ratio;
        image.style.width = `${width}px`;
        image.style.height = `${height}px`;
        positioning.currentHeight = height;
        positioning.currentWidth = width;
      } else if (isVertical) {
        let diff = Math.floor(
          positioning.startY - event.clientY / zoom,
        );
        diff = positioning.direction & Direction.south ? -diff : diff;

        const height = clamp(
          positioning.startHeight + diff,
          minHeight,
          maxHeightContainer,
        );

        image.style.height = `${height}px`;
        positioning.currentHeight = height;
      } else {
        let diff = Math.floor(
          positioning.startX - event.clientX / zoom,
        );
        diff = positioning.direction & Direction.east ? -diff : diff;

        const width = clamp(
          positioning.startWidth + diff,
          minWidth,
          maxWidthContainer,
        );

        image.style.width = `${width}px`;
        positioning.currentWidth = width;
      }
    }
  };
  const handlePointerUp = () => {
    const image = imageRef.current;
    const positioning = positioningRef.current;
    const controlWrapper = controlWrapperRef.current;
    if (
      image !== null && controlWrapper !== null && positioning.isResizing
    ) {
      const width = positioning.currentWidth;
      const height = positioning.currentHeight;
      positioning.startWidth = 0;
      positioning.startHeight = 0;
      positioning.ratio = 0;
      positioning.startX = 0;
      positioning.startY = 0;
      positioning.currentWidth = 0;
      positioning.currentHeight = 0;
      positioning.isResizing = false;

      controlWrapper.classList.remove("image-control-wrapper--resizing");

      setEndCursor();
      if (image instanceof HTMLImageElement) image.style.height = "auto";
      onResizeEnd(width, height);

      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    }
  };
  return (
    <div
      ref={controlWrapperRef}
      className={`image-control-wrapper${
        showResizers ? " image-control-wrapper--active" : ""
      }`}
    >
      {children}
      {showResizers && (
        <>
          <Handle
            corner="n"
            onPointerDown={(event) => {
              handlePointerDown(event, Direction.north);
            }}
          />
          <Handle
            corner="ne"
            onPointerDown={(event) => {
              handlePointerDown(
                event,
                Direction.north | Direction.east,
              );
            }}
          />
          <Handle
            corner="e"
            onPointerDown={(event) => {
              handlePointerDown(event, Direction.east);
            }}
          />
          <Handle
            corner="se"
            onPointerDown={(event) => {
              handlePointerDown(
                event,
                Direction.south | Direction.east,
              );
            }}
          />
          <Handle
            corner="s"
            onPointerDown={(event) => {
              handlePointerDown(event, Direction.south);
            }}
          />
          <Handle
            corner="sw"
            onPointerDown={(event) => {
              handlePointerDown(
                event,
                Direction.south | Direction.west,
              );
            }}
          />
          <Handle
            corner="w"
            onPointerDown={(event) => {
              handlePointerDown(event, Direction.west);
            }}
          />
          <Handle
            corner="nw"
            onPointerDown={(event) => {
              handlePointerDown(
                event,
                Direction.north | Direction.west,
              );
            }}
          />
        </>
      )}
    </div>
  );
}
