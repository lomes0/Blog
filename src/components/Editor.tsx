"use client";
import { RefCallback, RefObject } from "react";
import { COMMAND_PRIORITY_LOW } from "lexical";
import { mergeRegister } from "@lexical/utils";
import type { EditorDocument } from "@/types";
import {
  ALERT_COMMAND,
  ANNOUNCE_COMMAND,
  UPDATE_DOCUMENT_COMMAND,
} from "@/editor/commands";
import { actions, useDispatch } from "@/store";
import type { EditorState, LexicalEditor } from "lexical";
import Editor from "@/editor/Editor";

const Container: React.FC<{
  document: EditorDocument;
  editorRef?: RefObject<LexicalEditor | null> | RefCallback<LexicalEditor>;
  onChange?: (
    editorState: EditorState,
    editor: LexicalEditor,
    tags: Set<string>,
  ) => void;
  ignoreHistoryMerge?: boolean;
}> = ({ document, editorRef, onChange, ignoreHistoryMerge }) => {
  const dispatch = useDispatch();
  const editorRefCallback = (editor: LexicalEditor) => {
    if (typeof editorRef === "function") {
      editorRef(editor);
    } else if (typeof editorRef === "object") {
      editorRef.current = editor;
    }
    return mergeRegister(
      editor.registerCommand(
        ANNOUNCE_COMMAND,
        (payload) => {
          dispatch(actions.announce(payload));
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        ALERT_COMMAND,
        (payload) => {
          dispatch(actions.alert(payload));
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        UPDATE_DOCUMENT_COMMAND,
        () => {
          const editorState = editor.getEditorState();
          onChange?.(editorState, editor, new Set());
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  };

  // Ensure we have a valid editor state
  const getValidEditorState = () => {
    // If document.data is empty, null, or undefined, return null to let Lexical create default state
    if (!document.data || typeof document.data !== "object") {
      return null;
    }

    try {
      const stateString = JSON.stringify(document.data);
      const parsed = JSON.parse(stateString);

      // Validate that root exists and has the required structure
      if (
        !parsed.root || !parsed.root.children ||
        !Array.isArray(parsed.root.children)
      ) {
        console.warn("Invalid root structure, using default state");
        return null;
      }

      // If root has no children, return null to let Lexical create default state
      if (parsed.root.children.length === 0) {
        return null;
      }

      return stateString;
    } catch (error) {
      console.warn("Invalid document data, using default state:", error);
      // Return null to let Lexical create the default state
      return null;
    }
  };

  const editorState = getValidEditorState();
  const initialConfig = editorState ? { editorState } : {}; // Let Lexical create default state

  return (
    <Editor
      initialConfig={initialConfig}
      onChange={onChange}
      editorRef={editorRefCallback}
      ignoreHistoryMerge={ignoreHistoryMerge}
    />
  );
};

export default Container;
