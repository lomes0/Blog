"use client";
import { LexicalEditor } from "lexical";
import { lazy, Suspense } from "react";
import { nestedEditorConfig } from "../nestedConfig";

// Lazy, to keep the node -> plugins -> node import cycle from resolving at
// module-eval time. StickyComponent loads NestedEditor the same way.
const NestedEditor = lazy(() => import("@/editor/NestedEditor"));

/**
 * A canvas note's content surface: the full editor plugin set running against
 * the note's own child editor, so `/` insert, the floating toolbar, math,
 * images and the rest all work inside a note exactly as they do in the
 * document around it.
 */
export default function CanvasNoteEditor(
  { noteEditor }: { noteEditor: LexicalEditor },
) {
  return (
    <Suspense fallback={null}>
      <NestedEditor
        initialEditor={noteEditor}
        initialNodes={nestedEditorConfig.nodes}
      />
    </Suspense>
  );
}
