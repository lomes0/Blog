import { type EditorConfig, LexicalNode } from "lexical";
import {
  addClassNamesToElement,
  removeClassNamesFromElement,
} from "@lexical/utils";
import {
  figureInlineStyle,
  readAlignment,
  readDisplayWidth,
} from "./imageLayout";

const CSS_TO_STYLES: Map<string, Record<string, string>> = new Map();

export function getStyleObjectFromRawCSS(css: string): Record<string, string> {
  const styleObject: Record<string, string> = {};
  if (!css) return styleObject;
  const styles = css.split(";");

  for (const style of styles) {
    if (style !== "") {
      const [key, value] = style.split(/:([^]+)/); // split on first colon
      styleObject[key.trim()] = value.trim();
    }
  }

  return styleObject;
}

export function getStyleObjectFromCSS(css: string): Record<string, string> {
  let value = CSS_TO_STYLES.get(css);
  if (value === undefined) {
    value = getStyleObjectFromRawCSS(css);
    CSS_TO_STYLES.set(css, value);
  }
  return value;
}

export function getCSSFromStyleObject(styles: Record<string, string>): string {
  let css = "";

  for (const style in styles) {
    if (style) {
      css += `${style}: ${styles[style]};`;
    }
  }

  return css;
}

export function $getNodeStyleValueForProperty(
  node: LexicalNode,
  styleProperty: string,
  defaultValue: string = "",
): string {
  if (!isStylableNode(node)) return defaultValue;
  const css = node.getStyle();
  const styleObject = getStyleObjectFromCSS(css);

  if (styleObject !== null) {
    return styleObject[styleProperty] || defaultValue;
  }

  return defaultValue;
}

function $patchNodeStyle(
  target: LexicalNode,
  patch: Record<string, string | null>,
): void {
  if (!isStylableNode(target)) return;
  const prevStyles = getStyleObjectFromCSS(target.getStyle() || "");
  const newStyles = Object.entries(patch).reduce<Record<string, string>>(
    (styles, [key, value]) => {
      if (value === null) {
        delete styles[key];
      } else {
        styles[key] = value;
      }
      return styles;
    },
    { ...prevStyles },
  );
  const newCSSText = getCSSFromStyleObject(newStyles);
  target.setStyle(newCSSText);
  CSS_TO_STYLES.set(newCSSText, newStyles);
}

export function $patchStyle(
  target: LexicalNode | LexicalNode[],
  patch: Record<string, string | null>,
): void {
  if (Array.isArray(target)) {
    return target.forEach((node) => $patchNodeStyle(node, patch));
  }
  $patchNodeStyle(target, patch);
}

const hasGetStyle = (
  node: LexicalNode,
): node is LexicalNode & { getStyle(): string } => {
  return "getStyle" in node;
};

const hasSetStyle = (
  node: LexicalNode,
): node is LexicalNode & { setStyle(style: string): void } => {
  return "setStyle" in node;
};

const isStylableNode = (
  node: LexicalNode,
): node is LexicalNode & {
  getStyle(): string;
  setStyle(style: string): void;
} => {
  return hasGetStyle(node) && hasSetStyle(node);
};

export function getImageDimensions(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = src;
  });
}
export function floatWrapperElement(
  dom: HTMLElement,
  config: EditorConfig,
  float: string,
): void {
  if (!config.theme.float) {
    return;
  }
  const removeClasses: string[] = [];
  const addClasses: string[] = [];
  for (const format of ["left", "right"] as const) {
    const classes = config.theme.float[format];
    if (!classes) {
      continue;
    }
    (format === float ? addClasses : removeClasses).push(classes);
  }
  removeClassNamesFromElement(dom, ...removeClasses);
  addClassNamesToElement(dom, ...addClasses);
}

/**
 * Everything an image figure's `__style` string says about the `<figure>`
 * itself, applied to it.
 *
 * Called by `ImageNode.createDOM` and `ImageNode.updateDOM`, so the two cannot
 * drift — and, because `LexicalNode.exportDOM` is `createDOM(editor._config,
 * editor)` and every `exportDOM` on `ImageNode`, `GraphNode`, `SketchNode` and
 * `IFrameNode` routes through it, this is also the one place that decides what
 * the published page at `/view/[id]` looks like.
 *
 * It lives here rather than beside its caller for the reason
 * `SideBar/dragGeometry.ts` set: `ImageNode/index.tsx` reaches
 * `MathComponent`'s module-level `window.MathfieldElement` through its
 * caption's editor config, so nothing in that file can be constructed outside
 * a browser. This module imports `lexical` and a DOM, and no more.
 *
 * Four things ride the one style string:
 *
 *  - `float` → the theme's float classes, which wrap the following text.
 *  - `filter: auto` → the dark-mode filter class.
 *  - `width: N%` → an inline width, plus the theme's `imageSized` class so the
 *    picture inside stretches to the box rather than staying at its stored
 *    pixel size. The figure's children are built by React while editing and by
 *    `exportDOM` on the server, so that last part has to be a stylesheet rule;
 *    it is the one piece of this that is not an inline style.
 *  - `margin-inline` → alignment, deliberately ignored while the figure
 *    floats: a floated box is positioned by the float, and an auto margin on it
 *    is inert.
 *
 * The inline style is written as a whole attribute rather than property by
 * property, so that `updateDOM` replaces it wholesale instead of having to
 * remember which properties the previous state set.
 */
export function applyFigureLayout(
  element: HTMLElement,
  config: EditorConfig,
  css: string,
): void {
  const style = getStyleObjectFromRawCSS(css);
  const float = style.float;
  floatWrapperElement(element, config, float);
  element.classList.toggle(config.theme.darkModeFilter, style.filter === "auto");
  const width = readDisplayWidth(style);
  const isFloating = float === "left" || float === "right";
  const align = isFloating ? null : readAlignment(style);
  const sizedClass: string | undefined = config.theme.imageSized;
  if (sizedClass) element.classList.toggle(sizedClass, width !== null);
  const inlineStyle = figureInlineStyle(width, align);
  if (inlineStyle) element.setAttribute("style", inlineStyle);
  else element.removeAttribute("style");
}
