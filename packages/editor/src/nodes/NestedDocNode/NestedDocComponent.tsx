"use client";
/**
 * The nested doc's editing chrome: a titled card, and the dialog it opens.
 *
 * The card never mounts the nested editor. It renders a *derived* summary —
 * block count and a text preview — kept fresh by subscribing to the nested
 * editor, and the one live `LexicalNestedComposer` over that editor instance
 * exists only while the dialog is open. Two composers over one `LexicalEditor`
 * at the same time is a bug, not a layout choice, which is why the preview is
 * text rather than a second rendering.
 */
import { $getNodeByKey, $getRoot } from "lexical";
import type { LexicalEditor, NodeKey } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ChevronRight, SquarePen } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  ActionButton,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  TextField,
} from "../../ui";
import { nestedEditorConfig } from "../nestedConfig";
import { $asNestedDocNode, type NestedDocNodeLike } from "./utils";
import * as css from "./styles.css";

const NestedEditor = lazy(() => import("@/editor/NestedEditor"));

interface Summary {
  blocks: number;
  text: string;
}

const summarize = (doc: LexicalEditor): Summary =>
  doc.getEditorState().read(() => {
    const root = $getRoot();
    return { blocks: root.getChildrenSize(), text: root.getTextContent() };
  });

export default function NestedDocComponent(
  { nodeKey, title, open, doc }: {
    nodeKey: NodeKey;
    title: string;
    open: boolean;
    doc: LexicalEditor;
  },
) {
  const [editor] = useLexicalComposerContext();
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState<Summary>(() => summarize(doc));

  // The card's summary is derived from an editor the host document does not
  // re-render for: typing in the dialog dirties the nested editor, not this
  // node. Without this subscription the count and preview would be whatever
  // they were when the card last happened to render.
  useEffect(
    () => doc.registerUpdateListener(() => setSummary(summarize(doc))),
    [doc],
  );

  /** Every write to the node goes through the host editor, never the nested one. */
  const update = (change: (node: NestedDocNodeLike) => void) => {
    editor.update(() => {
      const node = $asNestedDocNode($getNodeByKey(nodeKey));
      if (node) change(node);
    });
  };

  return (
    <div className={css.card}>
      <div className={css.header}>
        <button
          aria-expanded={open}
          aria-label={open ? "Collapse this document" : "Expand this document"}
          className={css.disclosure}
          onClick={() => update((node) => node.toggleOpen())}
          type="button"
        >
          <ChevronRight size={16} />
        </button>
        <span className={css.title}>
          {title || <span className={css.untitled}>Untitled document</span>}
        </span>
        <span className={css.meta}>
          {summary.blocks} {summary.blocks === 1 ? "block" : "blocks"}
        </span>
        <ActionButton
          aria-label="Edit this document"
          icon
          onClick={() => setEditing(true)}
          size="sm"
          variant="ghost"
        >
          <SquarePen size={16} />
        </ActionButton>
      </div>

      {open && (
        <div className={css.preview}>
          {summary.text.trim()
            ? summary.text
            : <span className={css.empty}>Empty</span>}
        </div>
      )}

      <Dialog onOpenChange={setEditing} open={editing}>
        <DialogPopup fullScreen="mobile" size="lg">
          <DialogHeader>
            <DialogTitle>Nested document</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <TextField
              autoComplete="off"
              label="Title"
              onChange={(event) => {
                const next = event.target.value;
                update((node) => node.setTitle(next));
              }}
              placeholder="Untitled document"
              value={title}
            />
            <div className={css.surface}>
              <Suspense fallback={null}>
                <NestedEditor
                  initialEditor={doc}
                  initialNodes={nestedEditorConfig.nodes}
                />
              </Suspense>
            </div>
          </DialogBody>
          <DialogFooter>
            <ActionButton
              onClick={() => setEditing(false)}
              size="lg"
              variant="accent"
            >
              Done
            </ActionButton>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
