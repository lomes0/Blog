import type {
  SerializedParagraphNode,
  SerializedRootNode,
  SerializedTextNode,
} from "lexical";

/**
 * Build an initial Lexical editor state for a new document.
 * The root contains a single empty paragraph – the title is not injected
 * into the content, so the document starts blank.
 */
export function getEditorData() {
  const paragraphText: SerializedTextNode = {
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
    text: "",
    type: "text",
    version: 1,
  };

  const paragraph: SerializedParagraphNode = {
    children: [paragraphText],
    direction: "ltr",
    format: "",
    textFormat: 0,
    textStyle: "",
    indent: 0,
    type: "paragraph",
    version: 1,
  };

  const root: SerializedRootNode = {
    children: [paragraph],
    direction: "ltr",
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  };

  return { root };
}
