// @vitest-environment jsdom
/**
 * The DOM half of the image figure's layout.
 *
 * `imageLayout.test.ts` pins the strings; this pins what happens to a real
 * element when they are applied — the classes, the inline attribute, and the
 * two properties that are mutually exclusive by construction rather than by
 * convention.
 *
 * It opts into jsdom per the rule in CLAUDE.md rather than moving the whole
 * suite, and it exercises `nodes/utils.ts` rather than `ImageNode` itself:
 * importing the node reaches `MathComponent`'s module-level
 * `window.MathfieldElement` through its caption's editor config, so the class
 * cannot be constructed outside a browser. That is exactly why
 * `applyFigureLayout` lives in `utils.ts`.
 *
 * The claim this makes about the *published page* is indirect but exact:
 * `LexicalNode.exportDOM` is `createDOM(editor._config, editor)`, and every
 * `exportDOM` on `ImageNode`, `GraphNode`, `SketchNode` and `IFrameNode` goes
 * through `createDOM`. So the element built below is the element
 * `generateServerHtml` serializes for `/view/[id]`.
 */
import type { EditorConfig } from "lexical";
import { applyFigureLayout } from "../utils";
import { layoutPatch, widthPatch } from "../imageLayout";

/** The four theme keys `applyFigureLayout` reads, as `theme.tsx` spells them. */
const config = {
  namespace: "test",
  theme: {
    image: "LexicalTheme__image",
    imageSized: "LexicalTheme__imageSized",
    darkModeFilter: "LexicalTheme__darkModeFilter",
    float: {
      left: "LexicalTheme__floatLeft",
      right: "LexicalTheme__floatRight",
    },
  },
} as unknown as EditorConfig;

/** A `<figure>` as `ImageNode.createDOM` makes one, then styled. */
const figure = (css: string): HTMLElement => {
  const element = document.createElement("figure");
  element.className = "LexicalTheme__image";
  applyFigureLayout(element, config, css);
  return element;
};

const classes = (element: HTMLElement) => [...element.classList].sort();

describe("applyFigureLayout", () => {
  it("leaves a bare figure with no style attribute at all", () => {
    const element = figure("");
    expect(element.hasAttribute("style")).toBe(false);
    expect(classes(element)).toEqual(["LexicalTheme__image"]);
  });

  it("keeps float and the dark-mode filter working", () => {
    expect(classes(figure("float: left;"))).toContain(
      "LexicalTheme__floatLeft",
    );
    expect(classes(figure("float: right;"))).toContain(
      "LexicalTheme__floatRight",
    );
    expect(classes(figure("filter: auto;"))).toContain(
      "LexicalTheme__darkModeFilter",
    );
  });

  it("writes a percent width inline and marks the figure sized", () => {
    const element = figure("width: 50%;");
    expect(element.getAttribute("style")).toBe("width: 50%;");
    expect(classes(element)).toContain("LexicalTheme__imageSized");
  });

  it("does not mark a figure sized for a width it will not apply", () => {
    const element = figure("width: 300px;");
    expect(element.hasAttribute("style")).toBe(false);
    expect(classes(element)).not.toContain("LexicalTheme__imageSized");
  });

  it("blocks out an aligned figure", () => {
    expect(figure("margin-inline: auto;").getAttribute("style")).toBe(
      "display: flex; width: fit-content; margin-inline: auto;",
    );
  });

  /**
   * A floated box is positioned by the float; `margin-inline: auto` on it is
   * inert. Rather than emit a property that does nothing, the float wins and
   * the alignment is dropped from the DOM — so what the toolbar shows as the
   * current layout and what the reader sees are the same thing.
   */
  it("drops an alignment that a float has overruled", () => {
    const element = figure("float: left; margin-inline: auto;");
    expect(classes(element)).toContain("LexicalTheme__floatLeft");
    expect(element.hasAttribute("style")).toBe(false);
  });

  it("carries a width through a float", () => {
    const element = figure("float: right; width: 40%;");
    expect(element.getAttribute("style")).toBe("width: 40%;");
    expect(classes(element)).toContain("LexicalTheme__floatRight");
  });

  /**
   * `updateDOM` re-applies onto the element `createDOM` already built, so
   * every previous state has to be fully undone — a stale float class or a
   * leftover `display: flex` would be invisible until someone changed the
   * layout twice.
   */
  it("reaches the same element from any previous state", () => {
    const states = [
      "",
      "width: 50%;",
      "margin-inline: auto;",
      "width: 25%; margin-inline: auto 0;",
      "float: left;",
      "float: right; width: 40%;",
      "filter: auto; margin-inline: 0 auto;",
    ];
    for (const from of states) {
      for (const to of states) {
        const updated = figure(from);
        applyFigureLayout(updated, config, to);
        const fresh = figure(to);
        // Classes are compared as a set: `classList.toggle` appends, so the
        // order records which state the element passed through, and nothing
        // renders differently for it.
        expect(classes(updated)).toEqual(classes(fresh));
        expect(updated.getAttribute("style")).toBe(
          fresh.getAttribute("style"),
        );
      }
    }
  });

  it("agrees with the patches the toolbar writes", () => {
    const element = figure("");
    const style = { ...layoutPatch("align-center"), ...widthPatch(75) };
    applyFigureLayout(
      element,
      config,
      Object.entries(style)
        .filter(([, value]) => value !== null)
        .map(([key, value]) => `${key}: ${value};`)
        .join(" "),
    );
    expect(element.getAttribute("style")).toBe(
      "display: flex; width: 75%; margin-inline: auto;",
    );
    expect(classes(element)).toContain("LexicalTheme__imageSized");
    expect(classes(element)).not.toContain("LexicalTheme__floatLeft");
  });
});
