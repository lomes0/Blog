"use client";
import { Minus, Plus } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useCallback } from "react";
import { NumberStepperField, StepperButton } from "@/editor/ui";
import { ICON_SIZE } from "@/theme/icons";
import * as css from "./tools.css";

const MIN_ALLOWED_FONT_SIZE = 8;
const MAX_ALLOWED_FONT_SIZE = 72;

/**
 * Keys the stepper keeps for itself.
 *
 * It is mounted inside a Base UI select popup (`Menus/FontSelect`) as well as
 * in the toolbar proper, and that popup runs typeahead over its items — so an
 * unguarded digit would both type and jump the highlight. Escape and Tab are
 * how you *leave*, so they travel.
 *
 * What used to be here as well, and is now gone: an `input.closest("li")`
 * branch that focused the enclosing MUI `MenuItem` on ArrowDown. Base UI's
 * items are `div`s, so the query has matched nothing since the menus were
 * ported and the branch was dead code rather than behaviour.
 */
const POPUP_KEYS = new Set(["Escape", "Tab"]);

export const FontSizePicker = ({ fontSize, updateFontSize, onBlur }: {
  fontSize: string;
  updateFontSize: (fontSize: number) => void;
  onBlur: () => void;
}) => {
  const increaseFontSize = useCallback(() => {
    const currentFontSize = parseInt(fontSize);
    let updatedFontSize = currentFontSize;
    switch (true) {
      case currentFontSize < MIN_ALLOWED_FONT_SIZE:
        updatedFontSize = MIN_ALLOWED_FONT_SIZE;
        break;
      case currentFontSize < 12:
        updatedFontSize += 1;
        break;
      case currentFontSize < 20:
        updatedFontSize += 2;
        break;
      case currentFontSize < 36:
        updatedFontSize += 4;
        break;
      case currentFontSize <= 60:
        updatedFontSize += 12;
        break;
      default:
        updatedFontSize = MAX_ALLOWED_FONT_SIZE;
        break;
    }
    updateFontSize(updatedFontSize);
  }, [fontSize, updateFontSize]);

  const decreaseFontSize = useCallback(() => {
    const currentFontSize = parseInt(fontSize);
    let updatedFontSize = currentFontSize;
    switch (true) {
      case currentFontSize > MAX_ALLOWED_FONT_SIZE:
        updatedFontSize = MAX_ALLOWED_FONT_SIZE;
        break;
      case currentFontSize >= 48:
        updatedFontSize -= 12;
        break;
      case currentFontSize >= 24:
        updatedFontSize -= 4;
        break;
      case currentFontSize >= 14:
        updatedFontSize -= 2;
        break;
      case currentFontSize >= 9:
        updatedFontSize -= 1;
        break;
      default:
        updatedFontSize = MIN_ALLOWED_FONT_SIZE;
        break;
    }
    updateFontSize(updatedFontSize);
  }, [fontSize, updateFontSize]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") return onBlur();
    if (!POPUP_KEYS.has(event.key)) event.stopPropagation();
  };

  return (
    <NumberStepperField
      aria-label="font size"
      autoComplete="off"
      className={css.fontSizeInput}
      decrement={
        <StepperButton
          aria-label="decrease font size"
          disabled={parseInt(fontSize) <= MIN_ALLOWED_FONT_SIZE}
          onClick={(e) => {
            e.stopPropagation();
            decreaseFontSize();
            onBlur();
          }}
        >
          <Minus size={ICON_SIZE.dense} />
        </StepperButton>
      }
      increment={
        <StepperButton
          aria-label="increase font size"
          disabled={parseInt(fontSize) >= MAX_ALLOWED_FONT_SIZE}
          onClick={(e) => {
            e.stopPropagation();
            increaseFontSize();
            onBlur();
          }}
        >
          <Plus size={ICON_SIZE.dense} />
        </StepperButton>
      }
      max={MAX_ALLOWED_FONT_SIZE}
      min={MIN_ALLOWED_FONT_SIZE}
      rootClassName={css.fontSizeRoot}
      spellCheck="false"
      type="number"
      value={parseInt(fontSize) || ""}
      onBlur={(e) => {
        const inputValue = parseInt(e.target.value || "0") % 100;
        const prevValue = parseInt(fontSize);
        if (inputValue !== prevValue) return;
        if (inputValue < MIN_ALLOWED_FONT_SIZE) {
          updateFontSize(MIN_ALLOWED_FONT_SIZE);
        }
        if (inputValue > MAX_ALLOWED_FONT_SIZE) {
          updateFontSize(MAX_ALLOWED_FONT_SIZE);
        }
      }}
      onChange={(e) => {
        updateFontSize(parseInt(e.target.value || "0") % 100);
        e.target.focus();
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
    />
  );
};
