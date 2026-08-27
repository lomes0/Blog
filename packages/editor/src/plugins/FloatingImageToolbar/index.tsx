"use client";
/**
 * Size and position for the selected figure, anchored to the figure.
 *
 * ## What this is
 *
 * The controls are not new: the wrap buttons, the alignment set, the percent
 * presets and the width slider were all in `ToolbarPlugin/Tools/ImageTools`,
 * the last three behind a `Scaling` popover. This **moves** them
 * (docs/plans/archive/haklex-reprise.md §7.2). What is left in the main toolbar is the
 * verbs — edit, annotate, duplicate, download, open, delete, caption, adapt to
 * scheme — which read perfectly well from a bar at the top of the page. What
 * moved is everything spatial, which does not: judging a 50% width against a
 * column means seeing the column, and the toolbar is the one place on screen
 * that is nowhere near the figure.
 *
 * ## Anchored to the selection, never to hover
 *
 * A hover toolbar was refused twice — `archive/haklex-adoption.md` §10.7 cut
 * theirs, and §7.2 of the current plan says why the refusal stands. Hover
 * fights the eight resize grips for the same hit areas, and on a touch device
 * there is no hover at all, so the controls would be unreachable rather than
 * merely awkward. A node selection is unambiguous, survives a pointer leaving
 * the figure, and is the same state the main toolbar already keys off.
 *
 * ## Why there is no Base UI popover here, and why that is the point
 *
 * Two failure classes from `archive/haklex-adoption.md` §10.6.3 are avoided by
 * construction rather than by getting an option right:
 *
 *  - **The floating tree.** A Base UI `Popover` opened from inside a
 *    `Menu.Popup` is not in that menu's floating tree, so its first click
 *    reads as an outside press and closes the menu underneath it. This panel
 *    is portaled to the anchor element — root level, opened by nothing — so
 *    there is no tree to be outside of. It is the same resolution Table and
 *    Note reached when their colour triggers left their menus.
 *  - **`finalFocus`.** Base UI returns focus to a trigger *after* a 100ms exit
 *    animation, i.e. after the editor's own `setTimeout(0) → editor.focus()`,
 *    which silently steals the caret with every gate green. Nothing here
 *    returns focus, because nothing here ever takes it: every control cancels
 *    `mousedown`, whose default is what would move focus out of the document
 *    in the first place. The caret is never handed over, so there is nothing
 *    to hand back, and no ordering between two restores to get wrong.
 *
 * The caret contract is still not something a gate in this repo can assert —
 * it is on the browser list in §8.1 — but it is arranged so that there is no
 * mechanism left to fail.
 */
import {
  $getSelection,
  $isNodeSelection,
  COMMAND_PRIORITY_LOW,
  HISTORY_MERGE_TAG,
  type LexicalEditor,
  SELECTION_CHANGE_COMMAND,
  SKIP_SCROLL_INTO_VIEW_TAG,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { mergeRegister } from "@lexical/utils";
import { Provider, useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  AlignCenterVertical,
  AlignEndVertical,
  AlignLeft,
  AlignStartVertical,
} from "lucide-react";
import type {
  ChangeEvent,
  ComponentType,
  CSSProperties,
  MouseEvent,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { $isImageNode, type ImageNode } from "@/editor/nodes/ImageNode";
import { $isIFrameNode } from "@/editor/nodes/IFrameNode";
import {
  type ImageLayout,
  layoutPatch,
  snapWidth,
  tickOffset,
  WIDTH_MAX,
  WIDTH_MIN,
  WIDTH_PRESETS,
  widthPatch,
} from "@/editor/nodes/imageLayout";
import { $patchStyle, getStyleObjectFromCSS } from "@/editor/nodes/utils";
import { cx, getActionButtonClassName } from "@/editor/ui";
import { ICON_SIZE } from "@/theme/icons";
import { useFloatingElemPosition } from "@/editor/utils/useFloatingElemPosition";
import {
  displayWidthAtom,
  dragWidthAtom,
  figureStyleAtom,
  layoutAtom,
  sliderWidthAtom,
} from "./atoms";
import * as css from "./styles.css";

/** The same two classes `ImageTools` uses, so the panel matches the bar. */
const buttonClass = getActionButtonClassName({ size: "md", icon: true });
const presetClass = getActionButtonClassName({ size: "sm" });

/**
 * Keep the figure selected when a control is clicked.
 *
 * `mousedown`'s default is what moves focus, and this panel is only mounted
 * while the node selection exists — so cancelling it is both what keeps the
 * panel on screen and, per the header, what makes the caret contract
 * unbreakable. Same guard as `ui/color-picker`'s swatches.
 */
const keepSelection = (event: MouseEvent) => {
  event.preventDefault();
};

/**
 * MUI's `SvgIcon` was doing two things for these — sizing the glyph from the
 * theme's `fontSize="small"` and carrying the `viewBox`. Both are attributes
 * on a plain `<svg>`. Moved here with the wrap buttons they belong to.
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
 * The three floats, which take the figure out of flow so the text wraps
 * around it, and the three alignments, which leave it a block of its own and
 * only say where in the column it sits. Mutually exclusive — `layoutPatch`
 * writes one and clears the other — which is why both rows read their pressed
 * state from the single `ImageLayout` value.
 */
const WRAPS = [
  { layout: "float-left", label: "Wrap text on the left", Icon: FormatImageLeft },
  { layout: "none", label: "No text wrap", Icon: AlignLeft },
  {
    layout: "float-right",
    label: "Wrap text on the right",
    Icon: FormatImageRight,
  },
] as const satisfies ReadonlyArray<
  { layout: ImageLayout; label: string; Icon: ComponentType }
>;

const ALIGNMENTS = [
  { layout: "align-left", label: "Align left", Icon: AlignStartVertical },
  { layout: "align-center", label: "Center", Icon: AlignCenterVertical },
  { layout: "align-right", label: "Align right", Icon: AlignEndVertical },
] as const satisfies ReadonlyArray<
  { layout: ImageLayout; label: string; Icon: ComponentType }
>;

/** What every row is handed: one way to write a style patch. */
type PatchStyle = (
  patch: Record<string, string | null>,
  merge?: boolean,
) => void;

function LayoutRow(
  { label, options, updateStyle }: {
    label: string;
    options: typeof WRAPS | typeof ALIGNMENTS;
    updateStyle: PatchStyle;
  },
) {
  const layout = useAtomValue(layoutAtom);
  return (
    <div className={css.section}>
      <span className={css.label}>{label}</span>
      <div aria-label={label} className={css.row} role="group">
        {options.map(({ layout: value, label: optionLabel, Icon }) => (
          <button
            aria-label={optionLabel}
            aria-pressed={layout === value}
            className={cx(buttonClass, css.option)}
            key={value}
            title={optionLabel}
            type="button"
            onClick={() => updateStyle(layoutPatch(value))}
            onMouseDown={keepSelection}
          >
            <Icon size={ICON_SIZE.dense} />
          </button>
        ))}
      </div>
    </div>
  );
}

function WidthRow({ updateStyle }: { updateStyle: PatchStyle }) {
  const width = useAtomValue(displayWidthAtom);
  const sliderValue = useAtomValue(sliderWidthAtom);
  const [dragWidth, setDragWidth] = useAtom(dragWidthAtom);

  /**
   * A drag emits an update per step, and without `merge` a single gesture
   * would leave one undo entry per pixel travelled. The *first* step is
   * deliberately not merged — a merged first step would fold the whole drag
   * into whatever the author did before touching the figure, so undoing the
   * resize would also undo that.
   */
  const merging = useRef(false);

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

  const fill = `${
    ((sliderValue - WIDTH_MIN) / (WIDTH_MAX - WIDTH_MIN)) * 100
  }%`;

  return (
    <>
      <div className={css.section}>
        <span className={css.label}>Width</span>
        <div className={css.row}>
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
      </div>
      <div className={css.section}>
        {/* The label column, empty: the slider is the width row's second line
            and lines up under the presets rather than under a repeated word. */}
        <span aria-hidden="true" className={css.label} />
        <div className={css.row}>
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
              /* Stopped, not prevented: cancelling the default here would stop
                 the thumb from being dragged at all. */
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
            {width === null && dragWidth === null ? "Auto" : `${sliderValue}%`}
          </span>
        </div>
      </div>
    </>
  );
}

function FigurePanel(
  { editor, node, anchorElem }: {
    editor: LexicalEditor;
    node: ImageNode;
    anchorElem: HTMLElement;
  },
) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const setFigureStyle = useSetAtom(figureStyleAtom);

  /** The figure's own box — what the panel is anchored to. */
  const $figureRect = useCallback((): DOMRect | null => {
    return editor.getElementByKey(node.getKey())?.getBoundingClientRect() ??
      null;
  }, [editor, node]);

  useFloatingElemPosition(editor, anchorElem, panelRef, $figureRect);

  /**
   * Mirror the node's style into the store, and keep mirroring it.
   *
   * Every editor update, not only this panel's own: a resize drag, an undo and
   * an agent's write all reach the same `__style`, and a panel showing the
   * value from when it opened would be a second, stale answer on screen beside
   * the figure it describes.
   */
  const readStyle = useCallback(() => {
    return editor.getEditorState().read(() => {
      // `getLatest()`, because the node this panel holds is the version the
      // selection handed it: a resize or an undo since then would otherwise be
      // read off a frozen copy. It is what lets the selection keep one stable
      // node reference instead of re-deriving one on every keystroke.
      const style = node.getLatest().getStyle();
      return style ? getStyleObjectFromCSS(style) : {};
    });
  }, [editor, node]);

  useEffect(() => {
    setFigureStyle(readStyle());
    return editor.registerUpdateListener(() => {
      setFigureStyle(readStyle());
    });
  }, [editor, readStyle, setFigureStyle]);

  /**
   * Every write here targets the figure the reader is looking at, while the
   * caret is somewhere else entirely — selecting an image is a node selection
   * and never moves it. Committing untagged makes Lexical scroll that caret
   * back into view, yanking the figure off the screen.
   * `SKIP_SCROLL_INTO_VIEW_TAG` is `lexical`'s own export of the string, so the
   * spelling cannot drift from the version installed.
   */
  const updateStyle = useCallback<PatchStyle>((patch, merge = false) => {
    setFigureStyle((previous) => ({ ...previous, ...patch }));
    editor.update(() => {
      // `getLatest()` for the same reason as `readStyle`, and here it is
      // load-bearing rather than tidy: `$patchNodeStyle` merges the patch onto
      // whatever `getStyle()` returns, so a stale base would silently revert a
      // width the resizer committed a moment ago.
      $patchStyle(node.getLatest(), patch);
    }, {
      tag: merge
        ? [SKIP_SCROLL_INTO_VIEW_TAG, HISTORY_MERGE_TAG]
        : SKIP_SCROLL_INTO_VIEW_TAG,
    });
  }, [editor, node, setFigureStyle]);

  /**
   * Percent width is offered for pictures, not for embeds — an `<iframe>` has
   * no intrinsic ratio, so narrowing the figure letterboxes a video rather
   * than scaling it. The same finding `IFrameNode.resizeUnit` acts on. The
   * *position* half is offered for all four: it moves a figure without
   * touching its size.
   */
  const canSetWidth = !$isIFrameNode(node);

  return (
    <div className={css.panel} ref={panelRef}>
      <LayoutRow label="Wrap" options={WRAPS} updateStyle={updateStyle} />
      <LayoutRow
        label="Position"
        options={ALIGNMENTS}
        updateStyle={updateStyle}
      />
      {canSetWidth && <WidthRow updateStyle={updateStyle} />}
      <p className={css.hint}>
        Position moves the figure within the column and leaves it a block of its
        own. To make text run alongside it, use wrap.
      </p>
    </div>
  );
}

/**
 * The selected figure, and the editor it belongs to.
 *
 * `activeEditor` is tracked rather than assumed, the same way `ToolbarPlugin`
 * does it: `SELECTION_CHANGE_COMMAND` propagates from a nested editor up to
 * this one and carries the editor it came from, and a figure inside a sticky
 * note is a figure — but its DOM element and its updates belong to that nested
 * editor, not to this one.
 */
function useSelectedFigure(editor: LexicalEditor) {
  const [selected, setSelected] = useState<
    { editor: LexicalEditor; node: ImageNode } | null
  >(null);

  const read = useCallback((active: LexicalEditor) => {
    active.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isNodeSelection(selection)) return setSelected(null);
      const nodes = selection.getNodes();
      const node = nodes.length === 1 ? nodes[0] : null;
      if (!$isImageNode(node)) return setSelected(null);
      // Same figure, same object: this runs on every editor update, and a
      // fresh `{ editor, node }` each time would re-register the panel's
      // listeners and re-run its effects on every keystroke in the document.
      // The node instance is therefore *not* refreshed here — `FigurePanel`
      // takes `getLatest()` at the two points that read or write it.
      setSelected((previous) =>
        previous !== null && previous.editor === active &&
          previous.node.getKey() === node.getKey()
          ? previous
          : { editor: active, node }
      );
    });
  }, []);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      (_payload, active) => {
        read(active);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, read]);

  const active = selected?.editor ?? editor;
  useEffect(() => {
    return mergeRegister(
      active.registerUpdateListener(() => {
        read(active);
      }),
      active.registerRootListener(() => {
        if (active.getRootElement() === null) setSelected(null);
      }),
    );
  }, [active, read]);

  return selected;
}

export default function FloatingImageToolbarPlugin({
  anchorElem = document.body,
}: {
  anchorElem?: HTMLElement;
}) {
  const [editor] = useLexicalComposerContext();
  const isEditable = useLexicalEditable();
  const selected = useSelectedFigure(editor);

  if (!isEditable || selected === null) return null;

  return createPortal(
    /*
     * The `Provider` is what makes these atoms node-local rather than global,
     * and the `key` is what keeps them honest across figures: selecting a
     * different image builds a new store instead of handing the new panel the
     * previous one's in-flight drag. See `atoms.ts`.
     */
    <Provider key={selected.node.getKey()}>
      <FigurePanel
        anchorElem={anchorElem}
        editor={selected.editor}
        node={selected.node}
      />
    </Provider>,
    anchorElem,
  );
}
