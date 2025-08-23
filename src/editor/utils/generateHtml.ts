import type { SerializedEditorState } from "lexical";
import { createHeadlessEditor } from "@lexical/headless";
import { editorConfig } from "../config";
import { $generateHtmlFromNodes } from "@lexical/html";

const editor = createHeadlessEditor(editorConfig);

export const generateHtml = (data: SerializedEditorState) =>
  new Promise<string>((resolve, reject) => {
    try {
      // Validate the editor state data
      if (
        !data || !data.root || !data.root.children ||
        data.root.children.length === 0
      ) {
        console.warn("Editor state is empty or invalid:", data);
        resolve("<p></p>"); // Return empty paragraph for empty states
        return;
      }

      const editorState = editor.parseEditorState(data);
      editor.setEditorState(editorState);
      editorState.read(() => {
        let html = $generateHtmlFromNodes(editor);
        resolve(html);
      });
    } catch (error) {
      console.error("Error generating HTML:", error);
      reject(error);
    }
  });
