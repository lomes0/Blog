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
import { MutableRefObject, RefCallback, useEffect } from "react";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

/**
 * Read mode, as a property of the live editor rather than of the route.
 *
 * `pane.mode` used to be `/view/[id]` vs `/edit/[id]` — a navigation, a second
 * component tree and a remount, which threw away scroll position and undo
 * history every time an author glanced at their own post (plan §4.4). Toggling
 * `editable` on the mounted editor costs none of that.
 *
 * The initial value is also passed through `initialConfig` below, so the first
 * paint is already correct and this only handles later flips.
 */
const EditableSync: React.FC<{ editable: boolean }> = ({ editable }) => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.setEditable(editable);
  }, [editor, editable]);
  return null;
};

const Editor: React.FC<{
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
  onSave?: () => void | Promise<unknown>;
  onReset?: () => void;
  isActive?: boolean;
  editable?: boolean;
}> = (
  {
    initialConfig,
    onChange,
    editorRef,
    ignoreHistoryMerge,
    onSave,
    onReset,
    isActive,
    editable = true,
  },
) => {
  return (
    <LexicalComposer
      initialConfig={{ ...editorConfig, ...initialConfig, editable }}
    >
      <SharedHistoryContext>
        <EditableSync editable={editable} />
        <ToolbarPlugin
          isActive={isActive}
          onReset={onReset}
          onSave={onSave}
        />
        <EditorPlugins
          onChange={onChange}
          ignoreHistoryMerge={ignoreHistoryMerge}
          onSave={onSave}
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
