import type { SerializedEditorState } from "lexical";
import { createHeadlessEditor } from "@lexical/headless";
import { editorConfig } from "../config";
import { $generateHtmlFromNodes } from "@lexical/html";
import { JSDOM } from "jsdom";

// Create a new editor instance for each request instead of reusing the same instance
export const generateServerHtml = (data: SerializedEditorState) =>
  new Promise<string>((resolve, reject) => {
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
      const originalDOMParser = global.DOMParser;
      const originalHTMLElement = global.HTMLElement;
      const originalText = global.Text;
      const originalEvent = global.Event;
      const originalCustomEvent = global.CustomEvent;

      try {
        // Set global values for headless browser environment
        global.window = dom.window as any;
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
        global.DOMParser = dom.window.DOMParser;
        global.HTMLElement = dom.window.HTMLElement;
        global.Text = dom.window.Text;
        global.Event = dom.window.Event;
        global.CustomEvent = dom.window.CustomEvent;

        // Additional browser globals that might be needed
        global.getComputedStyle = dom.window.getComputedStyle;
        global.MutationObserver = dom.window.MutationObserver;

        // Create a new editor instance after setting up the globals
        const editor = createHeadlessEditor(editorConfig);

        // Validate input data
        if (!data || typeof data !== "object" || !data.root) {
          throw new Error("Invalid editor state data: missing root node");
        }

        let editorState;
        try {
          editorState = editor.parseEditorState(data);
        } catch (error) {
          const errorMessage = error instanceof Error
            ? error.message
            : "Unknown error";
          throw new Error(`Failed to parse editor state: ${errorMessage}`);
        }

        // Validate that the editor state has content
        if (!editorState) {
          throw new Error("Parsed editor state is empty or invalid");
        }

        // Try to set the editor state, if it fails due to empty root, create a minimal state
        try {
          editor.setEditorState(editorState);

          // Generate HTML from the state
          const html = editorState.read(() => $generateHtmlFromNodes(editor));
          resolve(html);
        } catch (setStateError) {
          // If setting state fails due to empty root, create a minimal valid state
          const emptyStateData = {
            root: {
              children: [
                {
                  children: [],
                  direction: null,
                  format: "",
                  indent: 0,
                  type: "paragraph",
                  version: 1,
                },
              ],
              direction: null,
              format: "",
              indent: 0,
              type: "root",
              version: 1,
            },
          };

          const emptyState = editor.parseEditorState(emptyStateData as any);
          editor.setEditorState(emptyState);

          // Generate HTML from the empty state
          const html = emptyState.read(() => $generateHtmlFromNodes(editor));
          resolve(html);
        }
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
        global.DOMParser = originalDOMParser;
        global.HTMLElement = originalHTMLElement;
        global.Text = originalText;
        global.Event = originalEvent;
        global.CustomEvent = originalCustomEvent;

        // Clean up any other globals we set
        if (global.getComputedStyle !== undefined) {
          delete (global as any).getComputedStyle;
        }
        if (global.MutationObserver !== undefined) {
          delete (global as any).MutationObserver;
        }
      }
    } catch (error) {
      console.error("Error generating HTML:", error);
      reject(error);
    }
  });
