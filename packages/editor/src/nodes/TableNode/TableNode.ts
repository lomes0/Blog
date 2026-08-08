import {
  SerializedTableNode as LexicalSerializedTableNode,
  TableNode as LexicalTableNode,
} from "@lexical/table";

import type {
  BaseSelection,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  ElementFormatType,
  LexicalEditor,
  LexicalNode,
  NodeKey,
} from "lexical";

import {
  addClassNamesToElement,
  isHTMLElement,
  removeClassNamesFromElement,
} from "@lexical/utils";
import { $applyNodeReplacement } from "lexical";
import { floatWrapperElement, getStyleObjectFromRawCSS } from "../utils";

export type SerializedTableNode = LexicalSerializedTableNode & {
  style: string;
  id: string;
};

function alignTableElement(
  dom: HTMLElement,
  config: EditorConfig,
  formatType: ElementFormatType,
): void {
  if (!config.theme.tableAlignment) {
    return;
  }
  const removeClasses: string[] = [];
  const addClasses: string[] = [];
  for (const format of ["left", "center", "right"] as const) {
    const classes = config.theme.tableAlignment[format];
    if (!classes) {
      continue;
    }
    (format === formatType ? addClasses : removeClasses).push(classes);
  }
  removeClassNamesFromElement(dom, ...removeClasses);
  addClassNamesToElement(dom, ...addClasses);
}

function wrapTableElement(
  element: HTMLElement,
  config: EditorConfig,
  clone?: boolean,
): HTMLElement {
  const wrapperElement = document.createElement("div");
  const classes = config.theme.tableScrollableWrapper;
  addClassNamesToElement(wrapperElement, classes);
  wrapperElement.appendChild(clone ? element.cloneNode(true) : element);
  return wrapperElement;
}

/**
 * Answers for tables stored under the pre-rename `type: "table"`.
 *
 * Until Lexical 0.44 the upgrade needed no class of its own: upstream
 * `TableNode.importJSON` called `$createTableNode()`, which routes through
 * `$applyNodeReplacement`, so the `{ replace: LexicalTableNode, with: … }`
 * entry in `config.tsx` caught the node on the way out. At 0.49 upstream
 * declares itself through `$config()` and has no own `static importJSON`; the
 * one Lexical synthesizes is `s => new klass().updateFromJSON(s)` — plain
 * construction, no replacement. Legacy JSON would therefore load as an
 * upstream `TableNode`, losing id/style/float/alignment and re-exporting as
 * `"table"`.
 *
 * So the registry entry for `"table"` needs a klass whose `importJSON` hands
 * off to ours. It sits *between* upstream and `TableNode` rather than beside
 * it because `withKlass` requires a strict subclass
 * (`LexicalEditor` node registration: `replaceWithKlass.prototype instanceof
 * klass`), and `withKlass` is what lets `registerNodeTransform` /
 * `registerMutationListener` on upstream's `TableNode` reach ours — which is
 * how `@lexical/table`'s own `registerTablePlugin` finds our subclass.
 */
export class LegacyTableNode extends LexicalTableNode {
  static getType(): string {
    return "table";
  }

  static clone(node: LegacyTableNode): LegacyTableNode {
    return new LegacyTableNode(node.__key);
  }

  static importJSON(serializedNode: LexicalSerializedTableNode): TableNode {
    // Pre-rename JSON carries neither field; without the defaults they would
    // reach the DOM as the string "undefined".
    return TableNode.importJSON({
      style: "",
      id: "",
      ...serializedNode,
    });
  }
}

/** @noInheritDoc */
export class TableNode extends LegacyTableNode {
  __style: string;
  __id: string;
  // `getType()` is the discriminator Lexical writes into the `type` field of
  // every serialized node and dispatches on when reading one back, so this
  // string is baked into stored content. Renaming it means rewriting every
  // stored revision that carries the old one in the same change — Lexical
  // throws on a `type` it has no class for. That was done once already, when
  // the fork's spellings were retired; see docs/plans/upstream-scrub.md.
  static getType(): string {
    return "blog-table";
  }

  static clone(node: TableNode): TableNode {
    const tableNode = new TableNode(node.__key);
    tableNode.__style = node.__style;
    tableNode.__id = node.__id;
    return tableNode;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      table: (_node: Node) => ({
        conversion: $convertTableElement,
        priority: 1,
      }),
    };
  }

  static importJSON(_serializedNode: SerializedTableNode): TableNode {
    const node = $createTableNode();
    node.setFormat(_serializedNode.format);
    node.setDirection(_serializedNode.direction);
    node.setStyle(_serializedNode.style);
    node.setId(_serializedNode.id);
    node.setRowStriping(_serializedNode.rowStriping || false);
    node.setColWidths(_serializedNode.colWidths);
    return node.updateFromJSON(_serializedNode);
  }

  constructor(key?: NodeKey) {
    super(key);
    this.__style = "";
    this.__id = "";
  }

  exportJSON(): SerializedTableNode {
    return {
      ...super.exportJSON(),
      style: this.__style,
      id: this.__id,
      type: TableNode.getType(),
    };
  }

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const element = super.createDOM(config, editor);
    const direction = this.getDirection();
    if (direction) element.dir = direction;
    if (this.__id) element.id = this.__id;
    alignTableElement(element, config, this.getFormatType());
    const wrapperElement = wrapTableElement(element, config);
    const float = getStyleObjectFromRawCSS(this.__style).float;
    floatWrapperElement(wrapperElement, config, float);
    return wrapperElement;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    super.updateDOM(prevNode, dom, config);
    if (!isHTMLElement(dom)) {
      return false;
    }
    const float = getStyleObjectFromRawCSS(this.__style).float;
    const colWidthsChanged = this.__colWidths !== prevNode.__colWidths;
    if (float && float !== "none" && colWidthsChanged) {
      return true;
    }
    if (this.__style !== prevNode.__style) {
      floatWrapperElement(dom, config, float);
    }
    if (this.__id !== prevNode.__id) {
      dom.id = this.__id;
    }
    alignTableElement(
      this.getDOMSlot(dom).element,
      config,
      this.getFormatType(),
    );
    return super.updateDOM(prevNode, dom, config);
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const output = super.exportDOM(editor);
    const element = output.element;
    if (!isHTMLElement(element)) {
      return output;
    }
    const config = editor._config;
    const direction = this.getDirection();
    if (direction) element.dir = direction;
    if (this.__id) element.id = this.__id;
    alignTableElement(element, config, this.getFormatType());

    return {
      after: (element) => {
        if (output.after) {
          element = output.after(element);
          if (!isHTMLElement(element)) {
            return null;
          }
          const wrapperElement = wrapTableElement(
            element,
            config,
            true,
          );
          const float = getStyleObjectFromRawCSS(this.__style).float;
          floatWrapperElement(wrapperElement, config, float);
          return wrapperElement;
        }
      },
      element,
    };
  }

  getStyle(): string {
    const self = this.getLatest();
    return self.__style;
  }

  setStyle(style: string): this {
    const self = this.getWritable();
    self.__style = style;
    return self;
  }

  getId(): string {
    const self = this.getLatest();
    return self.__id;
  }

  setId(id: string): this {
    const self = this.getWritable();
    self.__id = id;
    return self;
  }

  isSelected(selection?: null | BaseSelection): boolean {
    try {
      return super.isSelected(selection);
    } catch {
      return false;
    }
  }
}

export function $convertTableElement(_domNode: Node): DOMConversionOutput {
  const domNode = _domNode as HTMLTableElement;
  const tableNode = $createTableNode();
  tableNode.__style = domNode.style.cssText;
  tableNode.__id = domNode.id;
  return { node: tableNode };
}

export function $createTableNode(): TableNode {
  return $applyNodeReplacement(new TableNode());
}

export function $isTableNode(
  node: LexicalNode | null | undefined,
): node is TableNode {
  return node instanceof TableNode;
}
