"use client";
/**
 * Adapted from haklex `rich-editor-ui/src/components/color-picker` (MIT).
 *
 * A preset grid that flips to a full HSV picker (`picker-view.tsx`). The preset
 * hexes below are *content*, not theme: they are the colors a writer may set on
 * their text, and they must mean the same thing in both schemes and in an
 * exported document. DESIGN.md's own note on the app's swatch data says the
 * same — a palette is supposed to be literal.
 */
import { Check, ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { cx } from "../cx";
import { Popover, PopoverPanel, PopoverTrigger } from "../popover";
import { PickerView } from "./picker-view";
import * as css from "./styles.css";

const PRESET_COLORS = [
  { name: "Default", value: "inherit" },
  { name: "Gray", value: "#6b7280" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Green", value: "#22c55e" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
];

export interface ColorPickerProps {
  className?: string;
  currentColor: string;
  onSelect: (color: string) => void;
  /** Presets to offer; defaults to the built-in eleven. */
  presets?: { name: string; value: string }[];
  /**
   * Accessible name for the trigger. haklex has one picker per editor and
   * needs none; a toolbar that carries a text *and* a background control side
   * by side has two triggers that would otherwise be indistinguishable.
   */
  label?: string;
  /**
   * What the trigger draws. `"text"` is haklex's — a letter over a coloured
   * rule, the universal text-colour affordance. `"fill"` is a filled chip, for
   * the background-colour twin, which must not look like the same control.
   */
  variant?: "text" | "fill";
  /**
   * Told when the popup opens and closes. The editor's callers need both ends:
   * one reads the current colour off a MathLive field as the popup opens, and
   * every one of them puts the document selection back when it closes.
   */
  onOpenChange?: (open: boolean) => void;
}

export function ColorPicker({
  currentColor,
  onSelect,
  className,
  presets = PRESET_COLORS,
  label = "Color",
  variant = "text",
  onOpenChange,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"preset" | "picker">("preset");

  const displayColor = currentColor === "inherit" || !currentColor
    ? "currentColor"
    : currentColor;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setView("preset");
    onOpenChange?.(next);
  };

  const handlePreset = (value: string) => {
    onSelect(value);
    handleOpenChange(false);
  };

  const handleApply = (hex: string) => {
    onSelect(hex);
    handleOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        aria-label={label}
        className={cx(css.trigger, className)}
        render={
          <button type="button" onMouseDown={(e) => e.preventDefault()} />
        }
      >
        {variant === "fill"
          ? (
            <span
              className={css.triggerFill}
              style={{ backgroundColor: displayColor }}
            />
          )
          : (
            <span className={css.triggerLabel}>
              <span
                className={css.triggerLetter}
                style={{ color: displayColor }}
              >
                A
              </span>
              <span
                className={css.triggerBar}
                style={{ backgroundColor: displayColor }}
              />
            </span>
          )}
        <ChevronDown className={css.triggerChevron} />
      </PopoverTrigger>

      <PopoverPanel className={css.panel} side="bottom" sideOffset={6}>
        {view === "preset"
          ? (
            <div className={css.grid}>
              {presets.map((color) => (
                <button
                  aria-label={color.name}
                  className={css.swatch}
                  key={color.value}
                  type="button"
                  onClick={() => handlePreset(color.value)}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <span
                    className={css.swatchDot}
                    style={{
                      backgroundColor: color.value === "inherit"
                        ? "currentColor"
                        : color.value,
                    }}
                  />
                  {currentColor === color.value && (
                    <Check className={css.swatchCheck} />
                  )}
                </button>
              ))}
              <button
                aria-label="Custom color"
                className={css.swatch}
                type="button"
                onClick={() => setView("picker")}
                onMouseDown={(e) => e.preventDefault()}
              >
                <span className={css.addSwatchDot}>
                  <Plus className={css.addSwatchIcon} />
                </span>
              </button>
            </div>
          )
          : (
            <PickerView
              initialColor={currentColor}
              onApply={handleApply}
              onBack={() => setView("preset")}
              onCancel={() => handleOpenChange(false)}
            />
          )}
      </PopoverPanel>
    </Popover>
  );
}
