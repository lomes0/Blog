import type { SerializedEditorState } from "lexical";
import { createHeadlessEditor } from "@lexical/headless";
import { editorConfig } from "../config";
import { $generateDocxBlob } from "./docx";
import { type BlobBytes, withBlobBytes } from "./docx/blobs";
import { JSDOM } from "jsdom";

/**
 * `blobs` carries the bytes for any `/api/blob/<hash>` `src` in `data`, because
 * a .docx embeds its pictures and the conversion that reads them is synchronous
 * (docs/plans/blob-storage.md §9). The caller resolves them — this package has
 * no store to reach. An image whose bytes are absent exports as its alt text.
 */
export const generateDocx = (
  data: SerializedEditorState,
  blobs: BlobBytes = new Map(),
) =>
  new Promise<Blob>((resolve, reject) => {
    try {
      // Initialize JSDOM with more features enabled
      const dom = new JSDOM(
        "<!DOCTYPE html><html><head></head><body></body></html>",
        {
          url: "http://localhost",
          runScripts: "outside-only",
          pretendToBeVisual: true,
        },
      );

      // Store original global values
      const originalWindow = global.window;
      const originalDocument = global.document;
      const hasNavigator = "navigator" in global;
      const originalNavigator = hasNavigator ? global.navigator : undefined;
      const originalDocumentFragment = global.DocumentFragment;
      const originalElement = global.Element;

      try {
        // Set global values for headless browser environment
        global.window = dom.window as unknown as typeof globalThis.window;
        global.document = dom.window.document;
        // Define navigator with Object.defineProperty to handle the case
        // where it might be a read-only property
        Object.defineProperty(global, "navigator", {
          value: dom.window.navigator,
          configurable: true,
          writable: true,
        });
        global.DocumentFragment = dom.window.DocumentFragment;
        global.Element = dom.window.Element;

        const editor = createHeadlessEditor(editorConfig);
        const editorState = editor.parseEditorState(data);
        editor.setEditorState(editorState);
        const blob = withBlobBytes(
          blobs,
          () => editorState.read($generateDocxBlob),
        );
        resolve(blob);
      } finally {
        // Restore original global values
        global.window = originalWindow;
        global.document = originalDocument;

        // Restore navigator property safely using Object.defineProperty if it existed before
        if (hasNavigator) {
          try {
            Object.defineProperty(global, "navigator", {
              value: originalNavigator,
              configurable: true,
              writable: true,
            });
          } catch (e) {
            console.warn("Could not restore original navigator", e);
          }
        }

        global.DocumentFragment = originalDocumentFragment;
        global.Element = originalElement;
      }
    } catch (error) {
      console.error("Error generating DOCX:", error);
      reject(error);
    }
  });
