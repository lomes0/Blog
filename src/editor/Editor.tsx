"use client";
import type { EditorState, LexicalEditor } from "lexical";
import {
  InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { SharedHistoryContext } from "./context/SharedHistoryContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import ToolbarPlugin from "./plugins/ToolbarPlugin";
import { editorConfig } from "./config";
import { EditorPlugins } from "./plugins";
import { MutableRefObject, RefCallback } from "react";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";

export const Editor: React.FC<{
  initialConfig: Partial<InitialConfigType>;
  editorRef:
    | MutableRefObject<LexicalEditor | null>
    | RefCallback<LexicalEditor>;
  onChange?: (
    editorState: EditorState,
    editor: LexicalEditor,
    tags: Set<string>,
  ) => void;
  ignoreHistoryMerge?: boolean;
}> = ({ initialConfig, onChange, editorRef, ignoreHistoryMerge }) => {
  return (
    <LexicalComposer initialConfig={{ ...editorConfig, ...initialConfig }}>
      <SharedHistoryContext>
        <ToolbarPlugin />
        <EditorPlugins
          onChange={onChange}
          ignoreHistoryMerge={ignoreHistoryMerge}
          contentEditable={
            <ContentEditable
              className="editor-input"
              ariaLabel="editor input"
            />
          }
        />
        <EditorRefPlugin editorRef={editorRef} />
      </SharedHistoryContext>
    </LexicalComposer>
  );
};

export default Editor;
