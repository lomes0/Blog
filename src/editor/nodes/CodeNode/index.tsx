import { CodeNode as LexicalCodeNode, SerializedCodeNode } from "@lexical/code";
import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
} from "lexical";

/**
 * Extended SerializedCodeNode with width property.
 */
export interface SerializedCodeNodeWithWidth extends SerializedCodeNode {
  width?: string; // e.g., "80%", "600px", "100%"
  wrap?: boolean; // word-wrap (soft wrap) toggle
}

/**
 * Custom CodeNode that renders robust line numbers for exported (view-mode)
 * HTML.
 *
 * In the editor, `@lexical/code`'s `registerCodeHighlighting` keeps a
 * `data-gutter` attribute (e.g. "1\n2\n3") in sync on the <code> element, and a
 * single absolutely-positioned `::before` renders all line numbers from it.
 * That attribute is a runtime-only concern, so exported static HTML never has
 * it. Here we compute and inject the same `data-gutter` attribute during
 * export so view mode gets identical, gap-free line numbers that also handle
 * empty lines and auto-size with the digit count.
 *
 * Also supports dynamic width adjustment via the __width property.
 */
export class CodeNode extends LexicalCodeNode {
  __width?: string;
  __wrap?: boolean;
  static getType(): string {
    return "code";
  }

  static clone(node: CodeNode): CodeNode {
    const clonedNode = new CodeNode(node.__language, node.__key);
    clonedNode.__width = node.__width;
    clonedNode.__wrap = node.__wrap;
    return clonedNode;
  }

  constructor(language?: string | null | undefined, key?: NodeKey) {
    super(language, key);
  }

  /**
   * Get the width of the code block.
   */
  getWidth(): string | undefined {
    const self = this.getLatest();
    return self.__width;
  }

  /**
   * Set the width of the code block.
   * @param width - Width value (e.g., "80%", "600px", "100%")
   */
  setWidth(width: string | undefined): void {
    const self = this.getWritable();
    self.__width = width;
  }

  /**
   * Get whether the code block uses word-wrap (soft wrap).
   */
  getWrap(): boolean {
    const self = this.getLatest();
    return self.__wrap ?? false;
  }

  /**
   * Set whether the code block uses word-wrap (soft wrap).
   */
  setWrap(wrap: boolean): void {
    const self = this.getWritable();
    self.__wrap = wrap;
  }

  /**
   * Override createDOM to apply width styling in the editor.
   */
  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    if (this.__width) {
      element.style.width = this.__width;
    }
    if (this.__wrap) {
      element.classList.add("code-wrap");
    }
    return element;
  }

  /**
   * Override updateDOM to update width styling when it changes.
   */
  updateDOM(
    prevNode: this,
    dom: HTMLElement,
    config: EditorConfig,
  ): boolean {
    const isUpdated = super.updateDOM(prevNode, dom, config);

    // Update width if it changed
    if (prevNode.__width !== this.__width) {
      if (this.__width) {
        dom.style.width = this.__width;
      } else {
        dom.style.width = "";
      }
    }

    // Update word-wrap class if it changed
    if (prevNode.__wrap !== this.__wrap) {
      dom.classList.toggle("code-wrap", !!this.__wrap);
    }

    return isUpdated;
  }

  /**
   * Build the line-number gutter string (e.g. "1\n2\n3") for an exported code
   * element by counting its direct line-break children. Mirrors the attribute
   * maintained by `registerCodeHighlighting` in the editor.
   */
  private buildGutterAttr(element: HTMLElement): string {
    const lineBreaks = element.querySelectorAll(":scope > br").length;
    const lineCount = lineBreaks + 1;
    let gutter = "1";
    for (let i = 2; i <= lineCount; i++) {
      gutter += "\n" + i;
    }
    return gutter;
  }

  /**
   * Override exportDOM for clipboard/export operations.
   * Use the 'after' callback to process DOM after children are rendered.
   * Also applies the width style if set.
   */
  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const output = super.exportDOM(editor);

    return {
      ...output,
      after: (element) => {
        if (element instanceof HTMLElement) {
          // Inject line numbers for static (view-mode) rendering.
          element.setAttribute("data-gutter", this.buildGutterAttr(element));

          // Apply width if set
          if (this.__width) {
            element.style.width = this.__width;
          }

          // Persist word-wrap into the published article.
          if (this.__wrap) {
            element.classList.add("code-wrap");
          }

          return element;
        }
        // Call parent's after callback if it exists
        if (output.after) {
          return output.after(element);
        }
        return element as HTMLElement | Text | null | undefined;
      },
    };
  }

  /**
   * Import from serialized JSON.
   */
  static importJSON(serializedNode: SerializedCodeNodeWithWidth): CodeNode {
    const node = $createCodeNode(serializedNode.language);
    node.setFormat(serializedNode.format);
    node.setIndent(serializedNode.indent);
    node.setDirection(serializedNode.direction);

    // Restore width if present
    if (serializedNode.width) {
      node.setWidth(serializedNode.width);
    }

    // Restore word-wrap if present
    if (serializedNode.wrap) {
      node.setWrap(serializedNode.wrap);
    }

    return node;
  }

  /**
   * Export to serialized JSON.
   */
  exportJSON(): SerializedCodeNodeWithWidth {
    return {
      ...super.exportJSON(),
      width: this.__width,
      wrap: this.__wrap,
    };
  }

  /**
   * Import from DOM (for paste operations).
   */
  static importDOM(): DOMConversionMap | null {
    return LexicalCodeNode.importDOM();
  }
}

/**
 * Helper function to create a CodeNode instance.
 */
export function $createCodeNode(
  language?: string | null | undefined,
): CodeNode {
  return new CodeNode(language);
}

/**
 * Type guard to check if a node is a CodeNode.
 */
export function $isCodeNode(
  node: LexicalNode | null | undefined,
): node is CodeNode {
  return node instanceof CodeNode;
}
