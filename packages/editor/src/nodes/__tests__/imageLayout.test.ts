/**
 * The image figure's display width and alignment.
 *
 * Two claims are worth a spec here, and they are not the same claim:
 *
 *  1. **Round trip.** What `layoutPatch`/`widthPatch` write into `__style` is
 *     what `readLayout`/`readDisplayWidth` read back out. That is the only
 *     thing keeping a serialized-shape-free feature honest — the style string
 *     is free-form CSS, so nothing else type-checks it.
 *  2. **One string reaches the DOM.** `figureInlineStyle` is the whole of what
 *     `createDOM` sets, and every `exportDOM` on `ImageNode` and its three
 *     subclasses builds its element by calling `createDOM`. Pinning the string
 *     pins the editor and the published page at `/view/[id]` to the same
 *     answer.
 */
import {
  clampWidth,
  figureInlineStyle,
  type ImageLayout,
  layoutPatch,
  MARGIN_INLINE,
  readAlignment,
  readDisplayWidth,
  readLayout,
  snapWidth,
  tickOffset,
  WIDTH_MAX,
  WIDTH_MIN,
  WIDTH_PRESETS,
  widthPatch,
} from "../imageLayout";

/** Apply a patch the way `$patchStyle` does: null deletes, else overwrite. */
const applyPatch = (
  style: Record<string, string>,
  patch: Record<string, string | null>,
): Record<string, string> => {
  const next = { ...style };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
};

const ALL_LAYOUTS: ImageLayout[] = [
  "none",
  "align-left",
  "align-center",
  "align-right",
  "float-left",
  "float-right",
];

describe("clampWidth", () => {
  it("rounds to a whole percent", () => {
    expect(clampWidth(49.4)).toBe(49);
    expect(clampWidth(49.6)).toBe(50);
  });

  it("holds the slider's range at both ends", () => {
    expect(clampWidth(0)).toBe(WIDTH_MIN);
    expect(clampWidth(-40)).toBe(WIDTH_MIN);
    expect(clampWidth(400)).toBe(WIDTH_MAX);
  });

  it("answers full width for a value that is not a number", () => {
    expect(clampWidth(Number.NaN)).toBe(WIDTH_MAX);
    expect(clampWidth(Number.POSITIVE_INFINITY)).toBe(WIDTH_MAX);
  });
});

describe("snapWidth", () => {
  it("pulls a near miss onto its preset", () => {
    expect(snapWidth(48)).toBe(50);
    expect(snapWidth(52)).toBe(50);
    expect(snapWidth(97)).toBe(100);
  });

  it("leaves a value that is nobody's near miss alone", () => {
    expect(snapWidth(40)).toBe(40);
    expect(snapWidth(60)).toBe(60);
  });

  it("is idempotent — every preset snaps to itself", () => {
    for (const preset of WIDTH_PRESETS) {
      expect(snapWidth(preset)).toBe(preset);
    }
  });

  it("clamps before it snaps, so the top of the range is a preset", () => {
    expect(snapWidth(140)).toBe(100);
    // 10 is the floor and 25 is the nearest preset, five away: no snap.
    expect(snapWidth(-5)).toBe(WIDTH_MIN);
  });
});

describe("readDisplayWidth", () => {
  it("reads a percentage", () => {
    expect(readDisplayWidth({ width: "50%" })).toBe(50);
    expect(readDisplayWidth({ width: " 75% " })).toBe(75);
    expect(readDisplayWidth({ width: "33.5%" })).toBe(34);
  });

  it("is absent when there is no width at all", () => {
    expect(readDisplayWidth({})).toBeNull();
    expect(readDisplayWidth({ width: null })).toBeNull();
    expect(readDisplayWidth({ width: undefined })).toBeNull();
    expect(readDisplayWidth({ float: "left" })).toBeNull();
  });

  /**
   * The pixel size of a figure is `__width`/`__height`, which the resize
   * handles own. A second absolute width in the style string would be a silent
   * competitor to them, so it is not recognised and not passed on.
   */
  it("refuses any unit but percent", () => {
    expect(readDisplayWidth({ width: "300px" })).toBeNull();
    expect(readDisplayWidth({ width: "20em" })).toBeNull();
    expect(readDisplayWidth({ width: "auto" })).toBeNull();
    expect(readDisplayWidth({ width: "fit-content" })).toBeNull();
    expect(readDisplayWidth({ width: "calc(100% - 20px)" })).toBeNull();
  });

  it("holds a stored percentage inside the slider's range", () => {
    expect(readDisplayWidth({ width: "400%" })).toBe(WIDTH_MAX);
    expect(readDisplayWidth({ width: "1%" })).toBe(WIDTH_MIN);
  });
});

describe("readAlignment", () => {
  it("reads each of the three spellings back", () => {
    expect(readAlignment({ "margin-inline": MARGIN_INLINE.left })).toBe("left");
    expect(readAlignment({ "margin-inline": MARGIN_INLINE.center })).toBe(
      "center",
    );
    expect(readAlignment({ "margin-inline": MARGIN_INLINE.right })).toBe(
      "right",
    );
  });

  it("accepts the long spelling of centred", () => {
    expect(readAlignment({ "margin-inline": "auto auto" })).toBe("center");
  });

  it("tolerates the whitespace a hand-edited style string carries", () => {
    expect(readAlignment({ "margin-inline": "  0   auto " })).toBe("left");
  });

  it("is absent for anything it does not recognise", () => {
    expect(readAlignment({})).toBeNull();
    expect(readAlignment({ "margin-inline": "" })).toBeNull();
    expect(readAlignment({ "margin-inline": "1rem 2rem" })).toBeNull();
    expect(readAlignment({ margin: "auto" })).toBeNull();
  });
});

describe("readLayout", () => {
  it("calls a bare figure `none`", () => {
    expect(readLayout({})).toBe("none");
    expect(readLayout({ float: "none" })).toBe("none");
    expect(readLayout({ filter: "auto" })).toBe("none");
  });

  /**
   * A floated box is positioned by the float and ignores `margin-inline`, so
   * if a style string somehow carries both, float is what the reader sees.
   */
  it("lets float win over an alignment that cannot apply", () => {
    expect(readLayout({ float: "left", "margin-inline": "auto" })).toBe(
      "float-left",
    );
  });

  it("round-trips every layout through its own patch", () => {
    for (const layout of ALL_LAYOUTS) {
      expect(readLayout(applyPatch({}, layoutPatch(layout)))).toBe(layout);
    }
  });

  /**
   * The point of a single vocabulary: choosing one member clears whatever the
   * previous one wrote, so no sequence of choices can leave both set.
   */
  it("cannot be left holding a float and an alignment at once", () => {
    for (const first of ALL_LAYOUTS) {
      for (const second of ALL_LAYOUTS) {
        const style = applyPatch(
          applyPatch({}, layoutPatch(first)),
          layoutPatch(second),
        );
        expect(readLayout(style)).toBe(second);
        const floats = style.float === "left" || style.float === "right";
        expect(floats && style["margin-inline"] !== undefined).toBe(false);
      }
    }
  });

  it("leaves the dark-mode filter and the width alone", () => {
    const style = applyPatch(
      { filter: "auto", width: "50%" },
      layoutPatch("align-right"),
    );
    expect(style.filter).toBe("auto");
    expect(readDisplayWidth(style)).toBe(50);
  });
});

describe("widthPatch", () => {
  it("round-trips a percentage", () => {
    for (const preset of WIDTH_PRESETS) {
      expect(readDisplayWidth(applyPatch({}, widthPatch(preset)))).toBe(preset);
    }
  });

  it("deletes the property rather than writing `auto`", () => {
    expect(widthPatch(null)).toEqual({ width: null });
    const cleared = applyPatch({ width: "50%" }, widthPatch(null));
    expect("width" in cleared).toBe(false);
  });

  it("leaves the layout alone", () => {
    const style = applyPatch(
      applyPatch({}, layoutPatch("float-left")),
      widthPatch(60),
    );
    expect(readLayout(style)).toBe("float-left");
  });
});

describe("figureInlineStyle", () => {
  it("is empty for a figure that says nothing — no stray attribute", () => {
    expect(figureInlineStyle(null, null)).toBe("");
  });

  it("carries a width on its own without disturbing the flow", () => {
    // No `display`: an unaligned figure stays the inline-level box
    // `.LexicalTheme__image` makes it, positioned by its container's
    // `text-align` exactly as it was before this feature existed.
    expect(figureInlineStyle(50, null)).toBe("width: 50%;");
  });

  /**
   * `display: flex` is what makes alignment differ from float: it turns the
   * inline-level figure into a block of its own, which is the only state in
   * which an auto margin has anything to distribute.
   */
  it("blocks out an aligned figure and shrink-wraps it", () => {
    expect(figureInlineStyle(null, "center")).toBe(
      "display: flex; width: fit-content; margin-inline: auto;",
    );
    expect(figureInlineStyle(null, "left")).toBe(
      "display: flex; width: fit-content; margin-inline: 0 auto;",
    );
    expect(figureInlineStyle(null, "right")).toBe(
      "display: flex; width: fit-content; margin-inline: auto 0;",
    );
  });

  it("prefers an explicit width over the shrink-wrap", () => {
    expect(figureInlineStyle(75, "center")).toBe(
      "display: flex; width: 75%; margin-inline: auto;",
    );
    expect(figureInlineStyle(75, "center")).not.toContain("fit-content");
  });

  it("never emits two widths", () => {
    for (const align of [null, "left", "center", "right"] as const) {
      for (const width of [null, 10, 50, 100]) {
        const css = figureInlineStyle(width, align);
        expect(css.match(/width:/g)?.length ?? 0).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("tickOffset", () => {
  it("puts the ends of the range at the ends of the thumb's travel", () => {
    expect(tickOffset(WIDTH_MIN)).toBe("calc(6px + 0 * (100% - 12px))");
    expect(tickOffset(WIDTH_MAX)).toBe("calc(6px + 1 * (100% - 12px))");
  });

  it("is monotonic across the presets", () => {
    const ratios = WIDTH_PRESETS.map((preset) =>
      Number(/\+ ([\d.]+) \*/.exec(tickOffset(preset))![1])
    );
    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i]).toBeGreaterThan(ratios[i - 1]);
    }
  });
});
