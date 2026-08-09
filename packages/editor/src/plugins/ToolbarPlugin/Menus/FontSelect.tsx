"use client";
import { $isMathNode } from "@/editor/nodes/MathNode";
import { $patchStyle } from "@/editor/nodes/utils";
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
} from "@lexical/selection";
import {
  $getPreviousSelection,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  LexicalEditor,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import type { FocusEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { mergeRegister } from "@lexical/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/editor/ui";
import { useMediaQuery } from "@/editor/utils/useMediaQuery";
import { FontSizePicker } from "../Tools/FontSizePicker";
import * as css from "./menus.css";

const FONT_FAMILY_OPTIONS = [
  ["Roboto", "Roboto"],
  ["KaTeX_Main", "KaTeX"],
  ["Virgil", "Virgil"],
  ["Cascadia", "Cascadia"],
  ["Courier New", "Courier New"],
  ["Georgia", "Georgia"],
];

/** MUI's `theme.breakpoints.up("md")`, transcribed — see `useMediaQuery`. */
const UP_MD = "(min-width: 900px)";

/**
 * Keys the font-size stepper keeps for itself while it is mounted inside the
 * select popup.
 *
 * Base UI's list navigation and typeahead are registered on the popup, so an
 * unguarded keystroke inside the stepper does two things at once: a digit both
 * types and jumps the highlight to a font starting with that digit, and an
 * arrow both steps the size and moves the highlight (which, with the preview
 * below, would apply a font nobody asked for). Everything is stopped except the
 * two keys that are how you *leave* — Escape closes the popup, Tab moves on.
 */
const POPUP_KEYS = new Set(["Escape", "Tab"]);

export default function FontSelect({ editor }: { editor: LexicalEditor }) {
  const [fontSize, setFontSize] = useState<string>("16px");
  const [fontFamily, setFontFamily] = useState<string>("Roboto");
  const matches = useMediaQuery(UP_MD);
  const shouldMergeHistoryRef = useRef(false);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    const domSelection = window.getSelection();
    if (!domSelection) return false;
    const focusNode = domSelection.focusNode;
    if (!focusNode) return false;
    const isTextNode = focusNode.nodeType === Node.TEXT_NODE;
    const domElement = isTextNode
      ? focusNode.parentElement
      : focusNode as HTMLElement;
    if (!domElement) return false;
    const computedStyle = window.getComputedStyle(domElement);
    const currentFontSize = computedStyle.getPropertyValue("font-size");
    const currentFontFamily = computedStyle.getPropertyValue("font-family")
      .split(",")[0].trim().replace(/['"]+/g, "");
    if ($isRangeSelection(selection)) {
      const nextFontSize = $getSelectionStyleValueForProperty(
        selection,
        "font-size",
      );
      const nextFontFamily = $getSelectionStyleValueForProperty(
        selection,
        "font-family",
      );
      setFontSize(nextFontSize);
      setFontFamily(nextFontFamily);
      if (!nextFontSize) setFontSize(currentFontSize);
      if (!nextFontFamily) setFontFamily(currentFontFamily);
    } else {
      setFontSize(currentFontSize);
      setFontFamily(currentFontFamily);
    }
    return false;
  }, []);

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateToolbar();
          const selection = $getSelection();
          const previousSelection = $getPreviousSelection();
          const isSameSelection = $isRangeSelection(selection) &&
            $isRangeSelection(previousSelection) &&
            selection.anchor.key === previousSelection.anchor.key &&
            selection.anchor.offset ===
              previousSelection.anchor.offset &&
            selection.focus.key === previousSelection.focus.key &&
            selection.focus.offset ===
              previousSelection.focus.offset;
          shouldMergeHistoryRef.current &&= isSameSelection;
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateToolbar();
        });
      }),
    );
  }, [editor, updateToolbar]);

  const applyStyleText = useCallback(
    (styles: Record<string, string>) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          shouldMergeHistoryRef.current = true;
          $patchStyleText(selection, styles);
          const mathNodes = selection.getNodes().filter($isMathNode);
          $patchStyle(mathNodes, styles);
        }
      }, {
        discrete: true,
        tag: shouldMergeHistoryRef.current ? "history-merge" : undefined,
      });
    },
    [editor],
  );

  const updateFontSize = useCallback(
    (fontSize: number) => {
      setFontSize(fontSize + "px");
      applyStyleText({ "font-size": fontSize + "px" });
    },
    [setFontSize, applyStyleText],
  );

  const updateFontFamily = useCallback((value: string) => {
    setFontFamily(value);
    applyStyleText({ "font-family": value });
  }, [applyStyleText]);

  const restoreFocus = useCallback(() => {
    setTimeout(() => {
      editor.update(() => {
        const selection = $getSelection() || $getPreviousSelection();
        if (!selection) return;
        $setSelection(selection.clone());
      }, {
        discrete: true,
        onUpdate() {
          editor.focus(undefined, { defaultSelection: "rootStart" });
        },
      });
    }, 0);
  }, [editor]);

  const handleClose = useCallback(() => {
    shouldMergeHistoryRef.current = false;
    restoreFocus();
  }, [restoreFocus]);

  /**
   * Live preview while arrowing through the list — the behaviour MUI expressed
   * as `onFocusVisible` on each `MenuItem`, and the reason
   * `shouldMergeHistoryRef` exists: a sweep down the list writes one style
   * patch per stop, and they collapse into a single undo step only because
   * `applyStyleText` tags them `history-merge` until the selection moves.
   *
   * Base UI has no highlight event, but its `useListNavigation` is not virtual:
   * the highlighted item genuinely holds DOM focus, so `onFocus` is the same
   * signal. The `:focus-visible` test is what keeps it a *keyboard* preview —
   * items are also focused on hover (`highlightItemOnHover`, on by default),
   * and without the test merely sweeping the pointer down the list would
   * rewrite the document.
   */
  const previewOnKeyboardFocus = (option: string) =>
  (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.matches(":focus-visible")) return;
    if (fontFamily === option) return;
    updateFontFamily(option);
  };

  const containKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!POPUP_KEYS.has(event.key)) event.stopPropagation();
  };

  const options = FONT_FAMILY_OPTIONS.find(([option]) => option === fontFamily)
    ? FONT_FAMILY_OPTIONS
    : [...FONT_FAMILY_OPTIONS, [fontFamily, fontFamily]];

  return (
    <div className={css.row}>
      <Select<string>
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        onValueChange={(value) => {
          if (!value) return;
          updateFontFamily(value);
        }}
        value={fontFamily}
      >
        <SelectTrigger aria-label="font family" className={css.selectTrigger}>
          <SelectValue>
            {(value: string | null) => {
              const label =
                FONT_FAMILY_OPTIONS.find(([option]) => option === value)?.[1] ??
                  value;
              return (
                <>
                  <span
                    className={css.fontSample}
                    style={{ fontFamily: value ?? undefined }}
                  >
                    Aa
                  </span>
                  <span
                    className={css.triggerLabel}
                    style={{ fontFamily: value ?? undefined }}
                  >
                    {label}
                  </span>
                </>
              );
            }}
          </SelectValue>
        </SelectTrigger>
        {/* See `BlockFormatSelect` for why the popup is neither item-aligned
            nor allowed to claim focus when it closes. */}
        <SelectContent
          alignItemWithTrigger={false}
          className={css.popupSurface}
          finalFocus={false}
        >
          <div className={css.popupHeader} onKeyDown={containKeys}>
            <FontSizePicker
              fontSize={fontSize}
              updateFontSize={updateFontSize}
              onBlur={() => {}}
            />
          </div>
          {options.map(([option, text]) => (
            <SelectItem
              key={option}
              label={text}
              onFocus={previewOnKeyboardFocus(option)}
              value={option}
            >
              <span className={css.fontSample} style={{ fontFamily: option }}>
                Aa
              </span>
              <span className={css.optionLabel} style={{ fontFamily: option }}>
                {text}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {matches && (
        <FontSizePicker
          fontSize={fontSize}
          updateFontSize={updateFontSize}
          onBlur={restoreFocus}
        />
      )}
    </div>
  );
}
