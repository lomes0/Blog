"use client";
import { LexicalEditor, NodeKey } from "lexical";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { lazy, Suspense } from "react";
import { editorConfig } from "./config";
import { GripVertical } from "lucide-react";
import "./StickyNode.css";

const NestedEditor = lazy(() => import("@/editor/NestedEditor"));

export default function StickyComponent(
  { nodeKey, stickyEditor, children }: {
    nodeKey: NodeKey;
    stickyEditor: LexicalEditor;
    children?: React.ReactNode;
  },
) {
  const [isSelected, setSelected] = useLexicalNodeSelection(nodeKey);

  return (
    <div className="sticky-note-container" draggable={isSelected}>
      <div className="sticky-tools">
        <button
          type="button"
          className="drag-btn"
          aria-label="Drag sticky note"
          title="Drag"
          onMouseDown={() => setSelected(true)}
          onMouseUp={() => setSelected(false)}
        >
          <GripVertical />
        </button>
      </div>
      <Suspense fallback={children}>
        <NestedEditor
          initialEditor={stickyEditor}
          initialNodes={editorConfig.nodes}
        />
      </Suspense>
    </div>
  );
}
