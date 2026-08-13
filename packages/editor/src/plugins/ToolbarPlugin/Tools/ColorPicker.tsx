"use client";
/**
 * The toolbar's text- and background-colour pair.
 *
 * ## What changed, and why the call sites changed with it
 *
 * This was one MUI `Menu` holding both palettes as a 28-cell grid, opened from
 * a single palette-icon toggle, with a `toggle="menuitem"` mode for the two
 * places it was mounted *inside* another menu. Per docs/plans/archive/haklex-adoption.md
 * §6 the kit adopts haklex's picker rather than restyling ours, and haklex's is
 * one control for one colour — so the shape here is two of them.
 *
 * That is why the `toggle`/`menuitem` mode is gone rather than ported. A
 * Base UI `Popover` opened from inside a `Menu.Popup` is not part of that
 * menu's floating tree, so the first click inside the popover reads as an
 * outside press and closes the menu underneath it. `TableTools` and
 * `NoteTools` therefore carry these two triggers in the toolbar row beside
 * their menu button instead of as a row inside it — which also makes the
 * colours one click away rather than two.
 *
 * What the swap buys, beyond the retint: a custom colour. haklex's picker
 * flips to a full HSV view with a hex field and an eyedropper, so the palette
 * below is a set of presets rather than the only colours reachable.
 */
import { ColorPicker as SwatchPicker } from "@/editor/ui";
import * as css from "./tools.css";

/**
 * Unchanged from the MUI version, and deliberately still exported as bare hex
 * strings: `MathTools` asks MathLive `queryStyle({ color })` once per entry to
 * find which one a selection already carries, so the array is a lookup table as
 * well as a palette. These are content — the colours a writer sets on their own
 * text — not theme, so they are literals in both schemes by design.
 */
export const textPalette = [
  "#d7170b",
  "#fe8a2b",
  "#ffc02b",
  "#63b215",
  "#21ba3a",
  "#17cfcf",
  "#0d80f2",
  "#a219e6",
  "#eb4799",
  "#000000",
  "#666666",
  "#A6A6A6",
  "#d4d5d2",
  "#ffffff",
];

export const backgroundPalette = [
  "#fbbbb6",
  "#ffe0c2",
  "#fff1c2",
  "#d0e8b9",
  "#bceac4",
  "#b9f1f1",
  "#b6d9fb",
  "#e3baf8",
  "#f9c8e0",
  "#353535",
  "#8C8C8C",
  "#D0D0D0",
  "#F0F0F0",
  "#ffffff",
];

/** Names in palette order, for the swatch buttons' accessible labels. */
const HUE_NAMES = [
  "Red",
  "Orange",
  "Yellow",
  "Lime",
  "Green",
  "Cyan",
  "Blue",
  "Purple",
  "Pink",
];

const TEXT_NEUTRAL_NAMES = ["Black", "Dark grey", "Grey", "Light grey", "White"];
const BACKGROUND_NEUTRAL_NAMES = [
  "Charcoal",
  "Grey",
  "Light grey",
  "Off white",
  "White",
];

/**
 * `"inherit"` first, which is what the old grid's ✕ and eraser cells wrote —
 * the kit draws it as `currentColor`, so "no colour of its own" looks like the
 * surrounding text rather than like another swatch.
 */
function toPresets(palette: string[], neutralNames: string[]) {
  const names = [...HUE_NAMES, ...neutralNames];
  return [
    { name: "Default", value: "inherit" },
    ...palette.map((value, index) => ({
      name: names[index] ?? value,
      value,
    })),
  ];
}

const TEXT_PRESETS = toPresets(textPalette, TEXT_NEUTRAL_NAMES);
const BACKGROUND_PRESETS = toPresets(backgroundPalette, BACKGROUND_NEUTRAL_NAMES);

export default function ColorPicker(
  {
    onColorChange,
    onOpen,
    onClose,
    label,
    textColor,
    backgroundColor,
  }: {
    /** `key` is `"text"` or `"background"` — unchanged from the MUI version. */
    onColorChange: (key: string, value: string) => void;
    onOpen?: () => void;
    onClose?: () => void;
    /** Names what is being coloured: "Cell", "Note". Absent for running text. */
    label?: string;
    textColor?: string;
    backgroundColor?: string;
  },
) {
  const name = (what: string) =>
    label ? `${label} ${what} color` : `${what} color`;

  const handleOpenChange = (open: boolean) => {
    if (open) onOpen?.();
    else onClose?.();
  };

  return (
    <div className={css.colorPair}>
      <SwatchPicker
        currentColor={textColor ?? ""}
        label={name("text")}
        onOpenChange={handleOpenChange}
        onSelect={(value) => onColorChange("text", value)}
        presets={TEXT_PRESETS}
      />
      <SwatchPicker
        currentColor={backgroundColor ?? ""}
        label={name("background")}
        onOpenChange={handleOpenChange}
        onSelect={(value) => onColorChange("background", value)}
        presets={BACKGROUND_PRESETS}
        variant="fill"
      />
    </div>
  );
}
