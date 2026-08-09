"use client";
import {
  $parseSerializedNode,
  $setState,
  HISTORY_MERGE_TAG,
  LexicalEditor,
  SKIP_SCROLL_INTO_VIEW_TAG,
} from "lexical";
import { $isImageNode, ImageNode } from "@/editor/nodes/ImageNode";
import { $isSketchNode, SketchNode } from "@/editor/nodes/SketchNode";
import { $isGraphNode, GraphNode } from "@/editor/nodes/GraphNode";
import { $patchStyle, getStyleObjectFromCSS } from "@/editor/nodes/utils";
import {
  type ImageLayout,
  layoutPatch,
  readDisplayWidth,
  readLayout,
  snapWidth,
  tickOffset,
  WIDTH_MAX,
  WIDTH_MIN,
  WIDTH_PRESETS,
  widthPatch,
} from "@/editor/nodes/imageLayout";
import type { ChangeEvent, CSSProperties, MouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SET_DIALOGS_COMMAND } from "../Dialogs/commands";
import {
  AlignCenterVertical,
  AlignEndVertical,
  AlignLeft,
  AlignStartVertical,
  Captions,
  CaptionsOff,
  Contrast,
  Copy,
  Download,
  ExternalLink,
  Pencil,
  PenLine,
  Scaling,
  Trash2,
} from "lucide-react";
import { $isIFrameNode, IFrameNode } from "@/editor/nodes/IFrameNode";
import { ICON_SIZE } from "@/theme/icons";
import {
  cx,
  getActionButtonClassName,
  Popover,
  PopoverPanel,
  PopoverTrigger,
  Tooltip,
  TooltipProvider,
} from "@/editor/ui";
import { ANNOUNCE_COMMAND } from "@/editor/commands";
import { blockIdState } from "@/lib/content-bridge";
import {
  imageFileName,
  isDirectDownloadSrc,
  isOpenableImageSrc,
  isSafeImageSrc,
} from "@/editor/utils/imageSrc";
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

/** `Auto` and the four percent presets — text, not glyphs, so `icon: false`. */
const presetClass = getActionButtonClassName({ size: "sm" });

/**
 * Keep the figure selected when a control inside the portaled panel is
 * clicked. `mousedown`'s default is what moves focus, and this toolbar is only
 * mounted while the node selection exists. Same guard as `ui/color-picker`'s
 * swatches, and as haklex's `stopMouseDown`.
 */
const keepSelection = (event: MouseEvent) => {
  event.preventDefault();
};

/**
 * The three alignments, which are **not** the three floats above them.
 *
 * A float takes the figure out of flow so the following text wraps around it;
 * an alignment leaves it a block of its own and only says where in the content
 * column it sits. They are mutually exclusive — `layoutPatch` writes one and
 * clears the other — which is why both rows read their pressed state from the
 * single `ImageLayout` value rather than from `float` and `margin-inline`
 * separately.
 */
const ALIGNMENTS = [
  { layout: "align-left", label: "Align left", Icon: AlignStartVertical },
  { layout: "align-center", label: "Center", Icon: AlignCenterVertical },
  { layout: "align-right", label: "Align right", Icon: AlignEndVertical },
] as const satisfies ReadonlyArray<
  { layout: ImageLayout; label: string; Icon: typeof AlignStartVertical }
>;

/**
 * Hand a URL to the browser's downloader.
 *
 * The anchor is appended before it is clicked because Firefox ignores a click
 * on an element that is not in the document.
 */
function saveAs(href: string, fileName: string): void {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

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

  /**
   * Every write this toolbar makes targets the figure the reader is looking
   * at, and the caret is somewhere else entirely — usually offscreen, because
   * selecting an image is a node selection and never moves it. Committing an
   * update untagged makes Lexical scroll that caret back into view, yanking
   * the figure the reader just acted on off the screen.
   *
   * haklex tags the same updates (`useImageActions.ts:69-71`) with the string
   * `'skip-scroll-into-view'`; `SKIP_SCROLL_INTO_VIEW_TAG` is `lexical`'s own
   * export of it, so the spelling cannot drift from the version installed.
   *
   * Deliberately *not* applied to delete below: that one calls
   * `selectPrevious()`, so the caret genuinely moves and the reader should be
   * taken to where it landed.
   */
  const updateNode = useCallback((run: () => void, merge = false) => {
    editor.update(run, {
      // `merge` is for the width slider only: a drag emits an update per step,
      // and without it a single gesture would leave one undo entry per pixel
      // travelled. The *first* step is deliberately not merged — a merged
      // first step would fold the whole drag into whatever the author did
      // before touching the image, so undoing the resize would also undo that.
      tag: merge
        ? [SKIP_SCROLL_INTO_VIEW_TAG, HISTORY_MERGE_TAG]
        : SKIP_SCROLL_INTO_VIEW_TAG,
    });
  }, [editor]);

  function updateStyle(
    newStyle: Record<string, string | null>,
    merge = false,
  ) {
    setStyle((previous) => ({ ...previous, ...newStyle }));
    updateNode(() => {
      $patchStyle(node, newStyle);
    }, merge);
  }

  const toggleShowCaption = () => {
    updateNode(() => {
      node.setShowCaption(!node.getShowCaption());
    });
  };

  /**
   * Insert a copy of this figure after it.
   *
   * The round trip through serialized JSON is what keeps the subclass: three
   * classes extend `ImageNode`, and `$parseSerializedNode` dispatches on the
   * serialized `type` through the editor's registry, so a graph is rebuilt by
   * `GraphNode.importJSON` with its `value` intact rather than degraded to a
   * bare image. haklex's version hand-constructs an `$createImageNode` from
   * nine getters, which cannot do that — and would also share one caption
   * editor between the two nodes, because `clone()` passes the instance
   * through. `importJSON` parses a fresh nested editor from the caption's
   * serialized state instead.
   *
   * Two fields are cleared rather than copied, both because they name the node
   * rather than describe it:
   *
   *  - `__id` is the anchor-link target `LinkDialog` assigns, and it keeps it
   *    unique by clearing whichever figure held it before. Two figures sharing
   *    one is a duplicate DOM `id` and an ambiguous in-document link.
   *  - the persistent block id (`src/lib/content-bridge/blockId.ts`) is how an
   *    agent addresses a block across edits. Copying it would put two blocks
   *    behind one address, and the write that followed would land on whichever
   *    the walk reached first.
   */
  const duplicateNode = () => {
    updateNode(() => {
      // `getLatest()` because the toolbar holds whichever version of the node
      // the last selection change handed it — a resize since then would
      // otherwise be copied at its old size.
      const latest = node.getLatest();
      const copy = $parseSerializedNode(latest.exportJSON());
      if ($isImageNode(copy)) copy.setId("");
      $setState(copy, blockIdState, "");
      latest.insertAfter(copy);
    });
  };

  const src = node.getSrc();

  const openInNewTab = () => {
    if (!isOpenableImageSrc(src)) return;
    window.open(src, "_blank", "noopener,noreferrer");
  };

  /**
   * Save the figure to disk.
   *
   * Two cases, and only one of them is a plain anchor. An uploaded image is
   * `/api/attachments/…` — same origin, so `download` is honoured and the
   * session cookie rides along to a route that requires it. A graph or sketch
   * is a `data:` URL, same again. A *pasted external* image is neither: the
   * `download` attribute is ignored cross-origin, so the anchor would navigate
   * away and lose the reader's place. Those go through `fetch`, which needs
   * the host to grant CORS — and when it does not, there is no way to read the
   * bytes from this page at all. That case is announced rather than swallowed,
   * because the alternative is a button that looks like it worked.
   *
   * The failure is not `window.open`ed as a fallback: by then the click is
   * several hundred milliseconds old and a popup blocker will eat it.
   */
  const downloadNode = async () => {
    if (!isSafeImageSrc(src)) return;
    const fileName = imageFileName(src, node.getAltText());
    if (isDirectDownloadSrc(src, window.location.origin)) {
      saveAs(src, fileName);
      return;
    }
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const objectUrl = URL.createObjectURL(await response.blob());
      saveAs(objectUrl, fileName);
      // Not revoked synchronously: the download has not started yet when
      // `click()` returns.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch {
      editor.dispatchCommand(ANNOUNCE_COMMAND, {
        message: {
          title: "Downloading image failed",
          subtitle:
            "Its host does not allow this page to read it. Right-click the image and use the browser's own save instead.",
        },
      });
    }
  };

  const isImageNode = node.__type === "image";
  // An iframe's src is a page, not a picture — there is nothing to save.
  const canDownload = !$isIFrameNode(node) && isSafeImageSrc(src);
  const canOpen = isOpenableImageSrc(src);
  const isFiltered = style?.filter === "auto";
  const showCaption = node.getShowCaption();
  const layout = readLayout(style ?? {});

  /**
   * Percent width is offered for pictures, not for iframes.
   *
   * An image, a sketch and a graph are all rendered as an `<img>` or an
   * `<svg>` with an intrinsic aspect ratio, so a figure narrowed to 50% takes
   * its height down with it and the picture is simply smaller. An `<iframe>`
   * has no intrinsic ratio: its height is the `height` attribute `exportDOM`
   * writes in pixels, so narrowing the figure would letterbox a video rather
   * than scale it. Sizing an embed correctly means an aspect-ratio box around
   * the iframe, which is a different change from this one.
   *
   * The *alignment* half is offered for all four — it moves a figure without
   * touching its size, so an iframe is no different.
   */
  const canSetWidth = !$isIFrameNode(node);
  const width = readDisplayWidth(style ?? {});

  const [layoutOpen, setLayoutOpen] = useState(false);

  /* Same reason `NoteTools` re-selects on menu open: the panel is portaled, and
     the toolbar is only mounted while the node is selected. */
  useEffect(() => {
    if (!layoutOpen) return;
    updateNode(() => {
      node.select();
    });
  }, [layoutOpen, node, updateNode]);

  /**
   * The width the slider shows. `dragWidth` is the value of the gesture in
   * progress: the committed one arrives back through `style` a render later,
   * and reading only that would make the thumb stutter behind the pointer.
   */
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const merging = useRef(false);
  const sliderValue = dragWidth ?? width ?? WIDTH_MAX;
  const fill = `${
    ((sliderValue - WIDTH_MIN) / (WIDTH_MAX - WIDTH_MIN)) * 100
  }%`;

  const setWidth = (percent: number | null) => {
    setDragWidth(null);
    merging.current = false;
    updateStyle(widthPatch(percent));
  };

  const slideWidth = (event: ChangeEvent<HTMLInputElement>) => {
    const next = snapWidth(Number(event.target.value));
    setDragWidth(next);
    updateStyle(widthPatch(next), merging.current);
    merging.current = true;
  };

  const endSlide = () => {
    setDragWidth(null);
    merging.current = false;
  };

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
        <Tooltip content="Duplicate">
          <button
            aria-label="Duplicate"
            className={buttonClass}
            type="button"
            onClick={duplicateNode}
          >
            <Copy size={ICON_SIZE.dense} />
          </button>
        </Tooltip>
        {canDownload && (
          <Tooltip content="Download">
            <button
              aria-label="Download"
              className={buttonClass}
              type="button"
              onClick={() => void downloadNode()}
            >
              <Download size={ICON_SIZE.dense} />
            </button>
          </Tooltip>
        )}
        {canOpen && (
          <Tooltip content="Open in new tab">
            <button
              aria-label="Open in new tab"
              className={buttonClass}
              type="button"
              onClick={openInNewTab}
            >
              <ExternalLink size={ICON_SIZE.dense} />
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

        {/*
          Text wrap. These three write `float`, and the labels say "wrap"
          rather than "float" because that is the only thing that distinguishes
          them from the alignment row inside the panel next door — see the
          comment on `ALIGNMENTS`.
        */}
        <div aria-label="Text wrap" className={css.toolGroup} role="group">
          <Tooltip content="Wrap text on the left">
            <button
              aria-label="Wrap text on the left"
              aria-pressed={layout === "float-left"}
              className={buttonClass}
              type="button"
              onClick={() => updateStyle(layoutPatch("float-left"))}
            >
              <FormatImageLeft />
            </button>
          </Tooltip>
          <Tooltip content="No text wrap">
            <button
              aria-label="No text wrap"
              aria-pressed={layout === "none"}
              className={buttonClass}
              type="button"
              onClick={() => updateStyle(layoutPatch("none"))}
            >
              <AlignLeft size={ICON_SIZE.dense} />
            </button>
          </Tooltip>
          <Tooltip content="Wrap text on the right">
            <button
              aria-label="Wrap text on the right"
              aria-pressed={layout === "float-right"}
              className={buttonClass}
              type="button"
              onClick={() => updateStyle(layoutPatch("float-right"))}
            >
              <FormatImageRight />
            </button>
          </Tooltip>
        </div>

        <div className={css.toolGroup}>
          <Popover open={layoutOpen} onOpenChange={setLayoutOpen}>
            {/*
              No `Tooltip` wrapper, and `render` rather than a bare trigger:
              both follow `ui/color-picker`, the kit's other toolbar popover.
              The `mousedown` default is what would move focus out of the
              editor, and the toolbar is only mounted while the figure is
              selected — so every control in the panel below cancels it too.
            */}
            <PopoverTrigger
              aria-label={canSetWidth ? "Size and position" : "Position"}
              className={buttonClass}
              render={<button type="button" onMouseDown={keepSelection} />}
              title={canSetWidth ? "Size and position" : "Position"}
            >
              {canSetWidth
                ? <Scaling size={ICON_SIZE.dense} />
                : <AlignCenterVertical size={ICON_SIZE.dense} />}
            </PopoverTrigger>
            <PopoverPanel
              align="center"
              className={css.layoutPanel}
              side="bottom"
            >
              <div className={css.layoutSection}>
                <span className={css.layoutLabel}>Position</span>
                <div
                  aria-label="Position"
                  className={css.layoutRow}
                  role="group"
                >
                  {ALIGNMENTS.map(({ layout: value, label, Icon }) => (
                    <button
                      aria-label={label}
                      aria-pressed={layout === value}
                      className={cx(buttonClass, css.layoutOption)}
                      key={value}
                      title={label}
                      type="button"
                      onClick={() => updateStyle(layoutPatch(value))}
                      onMouseDown={keepSelection}
                    >
                      <Icon size={ICON_SIZE.dense} />
                    </button>
                  ))}
                </div>
                <p className={css.layoutHint}>
                  Position moves the figure within the column and leaves it a
                  block of its own. To make text run alongside it, use wrap.
                </p>
              </div>

              {canSetWidth && (
                <div className={css.layoutSection}>
                  <span className={css.layoutLabel}>Width</span>
                  <div className={css.layoutRow}>
                    <button
                      aria-label="Natural width"
                      aria-pressed={width === null}
                      className={cx(presetClass, css.widthPreset)}
                      type="button"
                      onClick={() => setWidth(null)}
                      onMouseDown={keepSelection}
                    >
                      Auto
                    </button>
                    {WIDTH_PRESETS.map((preset) => (
                      <button
                        aria-label={`${preset} percent`}
                        aria-pressed={width === preset}
                        className={cx(presetClass, css.widthPreset)}
                        key={preset}
                        type="button"
                        onClick={() => setWidth(preset)}
                        onMouseDown={keepSelection}
                      >
                        {preset}%
                      </button>
                    ))}
                  </div>
                  <div className={css.layoutRow}>
                    <span className={css.sizeSliderWrap}>
                      <input
                        aria-label="Width, percent of the content column"
                        className={css.sizeSlider}
                        max={WIDTH_MAX}
                        min={WIDTH_MIN}
                        step={1}
                        style={{ "--fill": fill } as CSSProperties}
                        type="range"
                        value={sliderValue}
                        onBlur={endSlide}
                        onChange={slideWidth}
                        onKeyUp={endSlide}
                        /* Stopped, not prevented: cancelling the default here
                           would stop the thumb from being dragged at all. */
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerUp={endSlide}
                      />
                      {WIDTH_PRESETS.map((preset) => (
                        <span
                          className={css.sizeSliderTick}
                          key={preset}
                          style={{ left: tickOffset(preset) }}
                        />
                      ))}
                    </span>
                    <span className={css.sizeValue}>
                      {width === null && dragWidth === null
                        ? "Auto"
                        : `${sliderValue}%`}
                    </span>
                  </div>
                </div>
              )}
            </PopoverPanel>
          </Popover>
        </div>
      </div>
    </TooltipProvider>
  );
}
