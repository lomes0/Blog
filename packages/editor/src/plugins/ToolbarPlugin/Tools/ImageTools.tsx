"use client";
import { LexicalEditor } from "lexical";
import { ImageNode } from "@/editor/nodes/ImageNode";
import { $isSketchNode, SketchNode } from "@/editor/nodes/SketchNode";
import { $isGraphNode, GraphNode } from "@/editor/nodes/GraphNode";
import { $patchStyle, getStyleObjectFromCSS } from "@/editor/nodes/utils";
import { useCallback, useEffect, useState } from "react";
import { SET_DIALOGS_COMMAND } from "../Dialogs/commands";
import {
  AlignLeft,
  Captions,
  CaptionsOff,
  Contrast,
  Pencil,
  PenLine,
  Trash2,
} from "lucide-react";
import { $isIFrameNode, IFrameNode } from "@/editor/nodes/IFrameNode";
import { ICON_SIZE } from "@/theme/icons";
import { getActionButtonClassName, Tooltip, TooltipProvider } from "@/editor/ui";
import * as css from "./tools.css";

/**
 * MUI's `SvgIcon` was doing two things here — sizing the glyph from the theme's
 * `fontSize="small"`, and carrying the `viewBox`. Both are attributes on a
 * plain `<svg>`, which is what the rest of the ported toolbar already uses (the
 * `Graph` mark in `Menus/InsertToolMenu`, `Highlight` in `TextFormatToggles`).
 */
const FormatImageRight = () => (
  <svg
    aria-hidden="true"
    fill="currentColor"
    height={ICON_SIZE.dense}
    viewBox="0 -960 960 960"
    width={ICON_SIZE.dense}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M450-285v-390h390v390H450Zm60-60h270v-270H510v270ZM120-120v-60h720v60H120Zm0-165v-60h270v60H120Zm0-165v-60h270v60H120Zm0-165v-60h270v60H120Zm0-165v-60h720v60H120Z" />
  </svg>
);

const FormatImageLeft = () => (
  <svg
    aria-hidden="true"
    fill="currentColor"
    height={ICON_SIZE.dense}
    viewBox="0 -960 960 960"
    width={ICON_SIZE.dense}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M120-285v-390h390v390H120Zm60-60h270v-270H180v270Zm-60-435v-60h720v60H120Zm450 165v-60h270v60H570Zm0 165v-60h270v60H570Zm0 165v-60h270v60H570ZM120-120v-60h720v60H120Z" />
  </svg>
);

/**
 * The class rather than `ActionButton`, for the reason the kit documents on
 * `getActionButtonClassName`: every button here is a tooltip trigger, and
 * Base UI's `render` hands the trigger a ref that only a real DOM element can
 * take. `aria-pressed` is what the recipe keys its selected state off, so the
 * toggles need nothing beyond it.
 */
const buttonClass = getActionButtonClassName({ size: "md", icon: true });

export default function ImageTools(
  { editor, node }: {
    editor: LexicalEditor;
    node: ImageNode | GraphNode | SketchNode | IFrameNode;
  },
) {
  const openImageDialog = () =>
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { image: { open: true } });
  const openGraphDialog = () =>
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { graph: { open: true } });
  const openSketchDialog = () =>
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { sketch: { open: true } });
  const openIFrameDialog = () =>
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { iframe: { open: true } });
  const openDialog = $isGraphNode(node)
    ? openGraphDialog
    : $isSketchNode(node)
    ? openSketchDialog
    : $isIFrameNode(node)
    ? openIFrameDialog
    : openImageDialog;

  const [style, setStyle] = useState<Record<string, string | null> | null>();

  const currentNodeStyle = useCallback(
    (): Record<string, string | null> | null => {
      return editor.getEditorState().read(() => {
        if ("getStyle" in node === false) return null;
        const css = node.getStyle();
        if (!css) return null;
        const style = getStyleObjectFromCSS(css);
        return style;
      });
    },
    [editor, node],
  );

  useEffect(() => {
    setStyle(currentNodeStyle());
  }, [node, currentNodeStyle]);

  function updateStyle(newStyle: Record<string, string | null>) {
    setStyle({ ...style, ...newStyle });
    editor.update(() => {
      $patchStyle(node, newStyle);
    });
  }

  const toggleShowCaption = () => {
    editor.update(() => {
      node.setShowCaption(!node.getShowCaption());
    });
  };

  const isImageNode = node.__type === "image";
  const isFiltered = style?.filter === "auto";
  const showCaption = node.getShowCaption();
  const float = style?.float;

  return (
    /* One provider for the row, so a tooltip re-shows instantly as the pointer
       travels along it — see the note in `TextFormatToggles`. */
    <TooltipProvider closeDelay={0} delay={500}>
      <div className={css.toolGroup}>
        <Tooltip content="Edit">
          <button
            aria-label="Edit"
            className={buttonClass}
            type="button"
            onClick={openDialog}
          >
            <Pencil size={ICON_SIZE.dense} />
          </button>
        </Tooltip>
        {isImageNode && (
          <Tooltip content="Annotate">
            <button
              aria-label="Annotate"
              className={buttonClass}
              type="button"
              onClick={openSketchDialog}
            >
              <PenLine size={ICON_SIZE.dense} />
            </button>
          </Tooltip>
        )}
        <Tooltip content="Delete">
          <button
            aria-label="Delete"
            className={buttonClass}
            type="button"
            onClick={() => {
              editor.update(() => {
                node.selectPrevious();
                node.remove();
              });
            }}
          >
            <Trash2 size={ICON_SIZE.dense} />
          </button>
        </Tooltip>
      </div>

      <div className={css.toolCluster}>
        <div className={css.toolGroup}>
          <Tooltip content={showCaption ? "Hide caption" : "Show caption"}>
            <button
              aria-label="Toggle caption"
              aria-pressed={showCaption}
              className={buttonClass}
              type="button"
              onClick={toggleShowCaption}
            >
              {showCaption
                ? <Captions size={ICON_SIZE.dense} />
                : <CaptionsOff size={ICON_SIZE.dense} />}
            </button>
          </Tooltip>
          <Tooltip content="Adapt to color scheme">
            <button
              aria-label="Adapt to color scheme"
              aria-pressed={isFiltered}
              className={buttonClass}
              type="button"
              onClick={() => {
                updateStyle({ "filter": isFiltered ? "none" : "auto" });
              }}
            >
              <Contrast size={ICON_SIZE.dense} />
            </button>
          </Tooltip>
        </div>

        <div className={css.toolGroup}>
          <Tooltip content="Float left">
            <button
              aria-label="Float left"
              aria-pressed={float === "left"}
              className={buttonClass}
              type="button"
              onClick={() => updateStyle({ "float": "left" })}
            >
              <FormatImageLeft />
            </button>
          </Tooltip>
          <Tooltip content="Inline">
            <button
              aria-label="Inline"
              aria-pressed={!float || float === "none"}
              className={buttonClass}
              type="button"
              onClick={() => updateStyle({ "float": "none" })}
            >
              <AlignLeft size={ICON_SIZE.dense} />
            </button>
          </Tooltip>
          <Tooltip content="Float right">
            <button
              aria-label="Float right"
              aria-pressed={float === "right"}
              className={buttonClass}
              type="button"
              onClick={() => updateStyle({ "float": "right" })}
            >
              <FormatImageRight />
            </button>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
