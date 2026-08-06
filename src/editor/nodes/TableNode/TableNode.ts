import {
  SerializedTableNode as LexicalSerializedTableNode,
  TableNode as LexicalTableNode,
} from "@lexical/table";

import { LEGACY_TABLE_TYPE } from "./legacyTypes";

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

/** @noInheritDoc */
export class TableNode extends LexicalTableNode {
  __style: string;
  __id: string;
  // `getType()` is the discriminator Lexical writes into the `type` field of
  // every serialized node and dispatches on when reading one back, so this
  // string is baked into stored content. Renaming it is safe only because
  // `LegacyTableNode` below still answers for the old spelling.
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

/**
 * Read-only alias for {@link LEGACY_TABLE_TYPE}, the type string this node
 * carried before the fork's name was scrubbed.
 *
 * Every table saved before that rename — in a Revision row, in a guest's
 * IndexedDB, in a `.zip` backup already on someone's disk — still carries it,
 * and Lexical throws on a `type` it has no entry for. Registering this
 * alongside `TableNode` gives that string an entry again.
 *
 * It only ever acts as an import entry point: `importJSON` delegates to
 * `TableNode`, which builds a real `TableNode`, so what lands in the editor is
 * the current class and the next save writes the current type. No instance of
 * this class is ever constructed, and `importDOM` is dropped so it cannot
 * register a second, competing conversion for `<table>`.
 *
 * The delegating statics are declared rather than inherited because Lexical
 * checks for them with `hasOwnProperty` at registration and warns per editor.
 *
 * Keep it. Migrating the database would not reach the backups.
 */
export class LegacyTableNode extends TableNode {
  static getType(): string {
    return LEGACY_TABLE_TYPE;
  }

  static clone(node: TableNode): TableNode {
    return TableNode.clone(node);
  }

  static importJSON(serializedNode: SerializedTableNode): TableNode {
    return TableNode.importJSON(serializedNode);
  }

  static importDOM(): DOMConversionMap | null {
    return null;
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
