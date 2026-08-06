import {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";

import { DecoratorNode } from "lexical";
import { JSX } from "react";
import AttachmentComponent from "./AttachmentComponent";

export interface AttachmentPayload {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
  key?: NodeKey;
  expanded?: boolean;
  editing?: boolean;
}

function convertAttachmentElement(domNode: Node): null | DOMConversionOutput {
  const element = domNode as HTMLElement;
  if (!element.dataset.attachment) {
    return null;
  }
  const url = element.dataset.url || (element as HTMLAnchorElement).href || "";
  const filename = element.dataset.filename ||
    (element as HTMLAnchorElement).download || "file";
  const mimetype = element.dataset.mimetype || "application/octet-stream";
  const size = parseInt(element.dataset.size || "0", 10);
  const expanded = element.dataset.expanded === "true";
  const editing = element.dataset.editing === "true";
  const node = $createAttachmentNode({
    url,
    filename,
    mimetype,
    size,
    expanded,
    editing,
  });
  return { node };
}

export type SerializedAttachmentNode = Spread<
  {
    url: string;
    filename: string;
    mimetype: string;
    size: number;
    expanded: boolean;
    editing: boolean;
  },
  SerializedLexicalNode
>;

export class AttachmentNode extends DecoratorNode<JSX.Element> {
  __url: string;
  __filename: string;
  __mimetype: string;
  __size: number;
  __expanded: boolean;
  __editing: boolean;

  static getType(): string {
    return "attachment";
  }

  static clone(node: AttachmentNode): AttachmentNode {
    return new AttachmentNode(
      node.__url,
      node.__filename,
      node.__mimetype,
      node.__size,
      node.__expanded,
      node.__editing,
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedAttachmentNode): AttachmentNode {
    const { url, filename, mimetype, size, expanded, editing } = serializedNode;
    return $createAttachmentNode({
      url,
      filename,
      mimetype,
      size,
      expanded: expanded ?? false,
      editing: editing ?? false,
    }).updateFromJSON(serializedNode);
  }

  exportDOM(): DOMExportOutput {
    // Create a modern, semantic attachment with preview support
    const wrapper = document.createElement("div");
    wrapper.setAttribute("class", "attachment-wrapper");
    wrapper.setAttribute("data-attachment", "true");
    wrapper.setAttribute("data-url", this.__url);
    wrapper.setAttribute("data-filename", this.__filename);
    wrapper.setAttribute("data-mimetype", this.__mimetype);
    wrapper.setAttribute("data-size", this.__size.toString());
    wrapper.setAttribute("data-expanded", this.__expanded.toString());

    const container = document.createElement("div");
    container.setAttribute("class", "attachment-container");

    // Main content area with link
    const content = document.createElement("div");
    content.setAttribute("class", "attachment-content");

    const link = document.createElement("a");
    link.setAttribute("href", this.__url);
    link.setAttribute("download", this.__filename);
    link.setAttribute("class", "attachment-link");
    link.setAttribute("rel", "noopener noreferrer");
    link.setAttribute("title", `Download ${this.__filename}`);

    // Icon with file type
    const icon = document.createElement("span");
    icon.setAttribute("class", "attachment-icon");
    const ext = this.__filename.split(".").pop()?.toLowerCase() || "file";
    icon.setAttribute("data-ext", ext);
    icon.textContent = "📄";
    icon.setAttribute("aria-hidden", "true");

    // Text content
    const textContent = document.createElement("div");
    textContent.setAttribute("class", "attachment-text");

    const filename = document.createElement("span");
    filename.setAttribute("class", "attachment-filename");
    filename.textContent = this.__filename;

    const extUpper = ext.toUpperCase();
    const sizeKB = Math.round(this.__size / 1024);
    const sizeMB = this.__size > 1024 * 1024
      ? (this.__size / (1024 * 1024)).toFixed(1) + "MB"
      : sizeKB + "KB";
    const info = document.createElement("span");
    info.setAttribute("class", "attachment-info");
    info.textContent = `${extUpper} • ${sizeMB}`;

    textContent.appendChild(filename);
    textContent.appendChild(info);

    link.appendChild(icon);
    link.appendChild(textContent);

    // Download indicator
    const downloadIcon = document.createElement("span");
    downloadIcon.setAttribute("class", "attachment-download");
    downloadIcon.setAttribute("aria-label", "Download");
    downloadIcon.textContent = "⬇";

    content.appendChild(link);
    content.appendChild(downloadIcon);

    // Toggle button for preview
    const toggleBtn = document.createElement("button");
    toggleBtn.setAttribute("class", "attachment-toggle");
    toggleBtn.setAttribute("type", "button");
    toggleBtn.setAttribute("aria-label", "Toggle preview");
    toggleBtn.setAttribute("data-toggle", "true");

    const toggleIcon = document.createElement("span");
    toggleIcon.setAttribute("class", "attachment-toggle-icon");
    toggleIcon.textContent = this.__expanded ? "−" : "+";
    toggleBtn.appendChild(toggleIcon);

    container.appendChild(content);
    container.appendChild(toggleBtn);

    // Preview container (will be populated by client-side JS)
    const preview = document.createElement("div");
    preview.setAttribute("class", "attachment-preview");
    preview.setAttribute("style", this.__expanded ? "" : "display: none;");

    wrapper.appendChild(container);
    wrapper.appendChild(preview);

    return { element: wrapper };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (node: Node) => {
        const span = node as HTMLSpanElement;
        if (!span.dataset.attachment) {
          return null;
        }
        return {
          conversion: convertAttachmentElement,
          priority: 1,
        };
      },
      a: (node: Node) => {
        const anchor = node as HTMLAnchorElement;
        if (!anchor.dataset.attachment) {
          return null;
        }
        return {
          conversion: convertAttachmentElement,
          priority: 1,
        };
      },
    };
  }

  constructor(
    url: string,
    filename: string,
    mimetype: string,
    size: number,
    expanded: boolean = false,
    editing: boolean = false,
    key?: NodeKey,
  ) {
    super(key);
    this.__url = url;
    this.__filename = filename;
    this.__mimetype = mimetype;
    this.__size = size;
    this.__expanded = expanded;
    this.__editing = editing;
  }

  exportJSON(): SerializedAttachmentNode {
    return {
      ...super.exportJSON(),
      url: this.getUrl(),
      filename: this.getFilename(),
      mimetype: this.getMimetype(),
      size: this.getSize(),
      expanded: this.getExpanded(),
      editing: this.getEditing(),
      type: "attachment",
      version: 1,
    };
  }

  getUrl(): string {
    return this.__url;
  }

  getFilename(): string {
    return this.__filename;
  }

  getMimetype(): string {
    return this.__mimetype;
  }

  getSize(): number {
    return this.__size;
  }

  getExpanded(): boolean {
    return this.getLatest().__expanded;
  }

  setExpanded(expanded: boolean): void {
    const writable = this.getWritable();
    writable.__expanded = expanded;
  }

  toggleExpanded(): void {
    this.setExpanded(!this.getExpanded());
  }

  getEditing(): boolean {
    return this.getLatest().__editing;
  }

  setEditing(editing: boolean): void {
    const writable = this.getWritable();
    writable.__editing = editing;
  }

  update(payload: Partial<AttachmentPayload>): void {
    const writable = this.getWritable();
    if (payload.url !== undefined) writable.__url = payload.url;
    if (payload.filename !== undefined) writable.__filename = payload.filename;
    if (payload.mimetype !== undefined) writable.__mimetype = payload.mimetype;
    if (payload.size !== undefined) writable.__size = payload.size;
    if (payload.expanded !== undefined) writable.__expanded = payload.expanded;
    if (payload.editing !== undefined) writable.__editing = payload.editing;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    const theme = config.theme;
    const className = theme.attachment;
    if (className !== undefined) {
      span.className = className;
    }
    return span;
  }

  updateDOM(): false {
    return false;
  }

  decorate(): JSX.Element {
    return (
      <AttachmentComponent
        url={this.__url}
        filename={this.__filename}
        mimetype={this.__mimetype}
        size={this.__size}
        nodeKey={this.getKey()}
        expanded={this.__expanded}
        editing={this.__editing}
      />
    );
  }
}

export function $createAttachmentNode({
  url,
  filename,
  mimetype,
  size,
  key,
  expanded = false,
  editing = false,
}: AttachmentPayload): AttachmentNode {
  return new AttachmentNode(
    url,
    filename,
    mimetype,
    size,
    expanded,
    editing,
    key,
  );
}

export function $isAttachmentNode(
  node: LexicalNode | null | undefined,
): node is AttachmentNode {
  return node instanceof AttachmentNode;
}
