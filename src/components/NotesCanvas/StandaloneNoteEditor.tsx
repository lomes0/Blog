"use client";
import { EditorState, LexicalEditor } from "lexical";
import { editorConfig } from "@/editor/config";
import { useCallback } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorPlugins } from "@/editor/plugins";

interface StandaloneNoteEditorProps {
  /** Serialized Lexical editor state, or "" for a new note. */
  content: string;
  onChange: (content: string) => void;
}

/**
 * The content editor for a note on a standalone `/notes` board, where the note
 * is its own database row and its content is a serialized editor state string.
 *
 * A canvas embedded in a document uses `NestedEditor` against a live child
 * editor instead — see `editor/nodes/CanvasNode`.
 */
export default function StandaloneNoteEditor({
  content,
  onChange,
}: StandaloneNoteEditorProps) {
  const handleChange = useCallback(
    (editorState: EditorState, _editor: LexicalEditor) => {
      onChange(JSON.stringify(editorState));
    },
    [onChange],
  );

  return (
    <LexicalComposer
      initialConfig={{ ...editorConfig, editorState: content || undefined }}
    >
      <EditorPlugins
        onChange={handleChange}
        contentEditable={
          <ContentEditable className="editor-input" ariaLabel="note editor" />
        }
      />
    </LexicalComposer>
  );
}
