"use client";
/**
 * Insertion, the invariant guard, and the tab strips
 * (docs/plans/haklex-reprise.md §6.2).
 *
 * **No `$wrapNodeInElement`**, for the reason `NestedDocPlugin` spells out:
 * `StickyPlugin` and `CanvasPlugin` wrap a root-level insert in a paragraph
 * because their nodes are inline decorators, and a paragraph is not an
 * addressable container (§2.4) — wrapping is exactly what puts a sticky's
 * contents beyond an agent's reach. A `CodeSnippetNode` is an `ElementNode`, so
 * `$insertNodes` leaves it a block in its own right. Adding a wrap here would
 * silently undo the phase.
 *
 * ### The strips are portals, one per snippet
 *
 * An element node has no `decorate()`, so this does by hand what Lexical's
 * `useDecorators` does for a decorator node: track the live snippets, resolve
 * the host element each node's `createDOM` set aside, and portal a React strip
 * into it.
 *
 * The host is resolved during render and never cached, because a cached one
 * outlives the DOM it pointed at: React would go on portalling into a detached
 * element and the strip would simply be missing, with nothing having failed.
 * The two things that can replace it are a new node (the mutation listener) and
 * a rebuilt root (the root listener) — hence exactly those two subscriptions,
 * and not an update listener, which would re-render every strip on every
 * keystroke in the document.
 */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $createTextNode,
  $insertNodes,
  $nodesOfType,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type LexicalCommand,
  type NodeKey,
} from "lexical";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { $createCodeNode } from "@/editor/nodes/CodeNode";
import {
  $createCodeSnippetNode,
  CodeSnippetNode,
} from "@/editor/nodes/CodeSnippetNode";
import CodeSnippetTabs from "@/editor/nodes/CodeSnippetNode/CodeSnippetTabs";
import { registerCodeSnippetGuard } from "@/editor/nodes/CodeSnippetNode/guard";
import { SNIPPET_TABS_CLASS } from "@/editor/nodes/CodeSnippetNode/utils";

export interface SnippetFilePayload {
  filename?: string;
  language?: string;
  code?: string;
}

export interface InsertCodeSnippetPayload {
  /** One entry per file. A snippet with no files cannot exist. */
  files?: ReadonlyArray<SnippetFilePayload>;
}

export const INSERT_CODE_SNIPPET_COMMAND: LexicalCommand<
  InsertCodeSnippetPayload | undefined
> = createCommand();

const DEFAULT_FILES: ReadonlyArray<SnippetFilePayload> = [
  { filename: "file1", language: "plain" },
];

export default function CodeSnippetPlugin() {
  const [editor] = useLexicalComposerContext();
  const [keys, setKeys] = useState<NodeKey[]>([]);
  /** Bumped when the root element is rebuilt, which invalidates every host. */
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!editor.hasNodes([CodeSnippetNode])) {
      throw new Error(
        "CodeSnippetPlugin: CodeSnippetNode not registered on editor",
      );
    }

    const track = () =>
      setKeys(
        editor.getEditorState().read(() =>
          $nodesOfType(CodeSnippetNode).map((node) => node.getKey())
        ),
      );
    track();

    return mergeRegister(
      registerCodeSnippetGuard(editor),
      editor.registerCommand<InsertCodeSnippetPayload | undefined>(
        INSERT_CODE_SNIPPET_COMMAND,
        (payload) => {
          const snippet = $createCodeSnippetNode();
          for (const file of payload?.files ?? DEFAULT_FILES) {
            const node = $createCodeNode(file.language ?? "plain");
            if (file.filename) node.setFilename(file.filename);
            if (file.code) node.append($createTextNode(file.code));
            snippet.append(node);
          }
          $insertNodes([snippet]);
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerMutationListener(CodeSnippetNode, track),
      editor.registerRootListener(() => setGeneration((n) => n + 1)),
    );
  }, [editor]);

  // Read so that a root rebuild re-runs the host lookups below; the value
  // itself means nothing.
  void generation;

  return (
    <>
      {keys.map((key) => {
        const host = editor.getElementByKey(key)?.querySelector<HTMLElement>(
          `:scope > .${SNIPPET_TABS_CLASS}`,
        );
        // A key one update stale — the node is gone, or its DOM is not built
        // yet. Either way the next mutation puts it right.
        if (!host) return null;
        return createPortal(
          <CodeSnippetTabs editor={editor} nodeKey={key} />,
          host,
          key,
        );
      })}
    </>
  );
}
