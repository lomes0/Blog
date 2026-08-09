/**
 * A figure's **display width** and **alignment**, as they live in `ImageNode`'s
 * `__style` string.
 *
 * ## Why the style string and not two serialized fields
 *
 * haklex carries the same two things as `layout` and `displayWidth` fields on
 * its image node. We cannot: `GraphNode`, `SketchNode` and `IFrameNode` all
 * `extends ImageNode` and spread `SerializedImageNode` into their own
 * serialized types, and all three re-declare multi-argument constructors and
 * `clone`/`importJSON` chains that enumerate `ImageNode`'s fields
 * *positionally*. A new field is therefore four constructors, four clones, four
 * `importJSON`s, four serialized types, four `check:nodes` arms and a migration
 * story for stored revisions of four node types.
 *
 * `__style` is already a serialized free-form CSS string, and `$patchStyle`
 * already writes into it — the same channel `float` and the dark-mode `filter`
 * ride. Percent width is `width: 50%` and alignment is `margin-inline: auto`,
 * so both cost **zero** serialization-shape change and zero subclass churn.
 *
 * ## Align is not float
 *
 * They are two answers to different questions and the vocabulary below keeps
 * them mutually exclusive rather than letting both be set at once:
 *
 *  - **float** takes the figure out of flow and *wraps the following text
 *    around it*. `float: left|right`, realized by the theme's `floatLeft` /
 *    `floatRight` classes.
 *  - **align** leaves the figure a block of its own — nothing wraps — and only
 *    decides where in the content column it sits. `margin-inline`, which is
 *    logical rather than physical so it follows the document's direction.
 *
 * A figure that floats is positioned by the float; `margin-inline` would be
 * inert on it. So `layoutPatch` writes one and clears the other, and
 * `readLayout` reports a single answer.
 *
 * Import-free by design, per the rule `SideBar/dragGeometry.ts` set and
 * `utils/imageSrc.ts` followed: the parsing, the snapping and the exact CSS
 * that reaches the DOM are all decided here, where they can be exercised
 * without mounting an editor — and the last of those is the half that has to
 * agree between `createDOM` and `exportDOM`.
 */

/** Where a non-floating figure sits in the content column. */
export type ImageAlignment = "left" | "center" | "right";

/**
 * One mutually exclusive layout choice, spanning both vocabularies.
 *
 * `"none"` is the default a figure has always had: an inline-level box in the
 * text flow, positioned by whatever `text-align` its container carries.
 */
export type ImageLayout =
  | "none"
  | "align-left"
  | "align-center"
  | "align-right"
  | "float-left"
  | "float-right";

/**
 * Percent widths the control offers as one-click buttons, and the same values
 * the slider snaps to. haklex's `ImageLayoutControls.tsx:25-28`.
 */
export const WIDTH_PRESETS = [25, 50, 75, 100] as const;

/** The slider's ends. Below 10% a figure is smaller than its own caption. */
export const WIDTH_MIN = 10;
export const WIDTH_MAX = 100;

/** How close to a preset the slider has to land to be pulled onto it. */
export const WIDTH_SNAP = 3;

/** Round to a whole percent and hold it inside the slider's range. */
export function clampWidth(value: number): number {
  if (!Number.isFinite(value)) return WIDTH_MAX;
  return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Math.round(value)));
}

/** Pull a value onto a preset when it is within `WIDTH_SNAP` of one. */
export function snapWidth(value: number): number {
  const clamped = clampWidth(value);
  for (const preset of WIDTH_PRESETS) {
    if (Math.abs(clamped - preset) <= WIDTH_SNAP) return preset;
  }
  return clamped;
}

/**
 * The slider's ticks. The thumb is 12px wide, so its centre travels within
 * `[6px, 100% - 6px]` — a tick drawn at a flat percentage of the track would
 * sit off the thumb at both ends. haklex's `tickLeft`.
 */
export function tickOffset(preset: number): string {
  const ratio = (preset - WIDTH_MIN) / (WIDTH_MAX - WIDTH_MIN);
  return `calc(6px + ${ratio} * (100% - 12px))`;
}

/** How each alignment is spelled in the style string. */
export const MARGIN_INLINE: Readonly<Record<ImageAlignment, string>> = {
  left: "0 auto",
  center: "auto",
  right: "auto 0",
};

/** A style object as `getStyleObjectFromRawCSS` produces one. */
type StyleObject = Readonly<Record<string, string | null | undefined>>;

const normalize = (value: string | null | undefined): string =>
  (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The display width, in whole percent, or `null` for the figure's natural size.
 *
 * **Only a percentage is recognised.** A `width` in any other unit is reported
 * as absent and is not passed through to the DOM: the pixel size of a figure is
 * `__width`/`__height`, which the resize handles own, and a second absolute
 * width in the style string would be a silent competitor to them.
 */
export function readDisplayWidth(style: StyleObject): number | null {
  const match = /^(\d+(?:\.\d+)?)%$/.exec(normalize(style.width));
  if (!match) return null;
  return clampWidth(Number(match[1]));
}

/** The alignment, or `null` when the figure is in ordinary text flow. */
export function readAlignment(style: StyleObject): ImageAlignment | null {
  const value = normalize(style["margin-inline"]);
  if (!value) return null;
  if (value === "auto" || value === "auto auto") return "center";
  for (const align of ["left", "right"] as const) {
    if (value === MARGIN_INLINE[align]) return align;
  }
  return null;
}

/**
 * Which single layout a style string describes. Float wins over alignment,
 * because a floated figure ignores `margin-inline` — so if both are somehow
 * present, float is what the reader is actually seeing.
 */
export function readLayout(style: StyleObject): ImageLayout {
  const float = normalize(style.float);
  if (float === "left" || float === "right") return `float-${float}`;
  const align = readAlignment(style);
  return align ? `align-${align}` : "none";
}

/** The style patch that puts a figure into `layout`, clearing the other half. */
export function layoutPatch(
  layout: ImageLayout,
): Record<string, string | null> {
  if (layout === "float-left" || layout === "float-right") {
    return { float: layout === "float-left" ? "left" : "right", "margin-inline": null };
  }
  if (layout === "none") return { float: "none", "margin-inline": null };
  const align = layout.slice("align-".length) as ImageAlignment;
  return { float: "none", "margin-inline": MARGIN_INLINE[align] };
}

/** The style patch for a display width; `null` restores the natural size. */
export function widthPatch(
  percent: number | null,
): Record<string, string | null> {
  return { width: percent === null ? null : `${clampWidth(percent)}%` };
}

/**
 * The `<figure>`'s inline `style` attribute — the exact string `createDOM`
 * sets, and therefore the exact string `exportDOM` emits, since every
 * `exportDOM` on `ImageNode` and its three subclasses builds its element by
 * calling `createDOM`.
 *
 * Three properties, and each is load-bearing:
 *
 *  - `width` is the percent itself, resolved against the content column.
 *  - `display: flex` because `.LexicalTheme__image` is `inline-flex`, and
 *    `margin-inline: auto` does nothing on an inline-level box. Alignment is
 *    the thing that makes the figure a block of its own — which is exactly the
 *    difference from float.
 *  - `width: fit-content` when a figure is aligned but not sized: a block-level
 *    flex container with `width: auto` fills the column, and an auto margin
 *    against a full-width box has nothing to distribute.
 *
 * Written as one attribute rather than three CSSOM assignments so that the
 * value is a pure function of the style object — and so `updateDOM` can replace
 * it wholesale without having to remember which properties a previous state
 * had set.
 */
export function figureInlineStyle(
  width: number | null,
  align: ImageAlignment | null,
): string {
  const parts: string[] = [];
  if (align !== null) parts.push("display: flex");
  if (width !== null) parts.push(`width: ${width}%`);
  else if (align !== null) parts.push("width: fit-content");
  if (align !== null) parts.push(`margin-inline: ${MARGIN_INLINE[align]}`);
  return parts.length === 0 ? "" : `${parts.join("; ")};`;
}
