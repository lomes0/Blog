"use client";
/**
 * The snippet's editing chrome: one tab per file, and the controls for the file
 * that is open (docs/plans/archive/haklex-reprise.md §6.2).
 *
 * ### Why this is a portal and not a `decorate()`
 *
 * `CodeSnippetNode` is an `ElementNode`, because its files have to be real
 * Lexical children — that is the whole phase. An element node has no
 * `decorate()`, so `CodeSnippetPlugin` does by hand what Lexical's
 * `useDecorators` does for a decorator: it portals this component into an
 * element the node's `createDOM` set aside for it. The strip therefore sits in
 * normal flow inside the block, and none of `CodeActionMenuPlugin`'s
 * measure-and-position machinery is needed or copied.
 *
 * ### The language list is the code block's own
 *
 * `getCodeLanguageOptions()` from `utils/codeLanguage.ts` — the same list the
 * code block's own header dropdown renders, so a file and a standalone block
 * cannot end up offering different languages. Phase 2's tokenizer then
 * highlights the file with no further wiring: it transforms `code` nodes
 * wherever they sit.
 */
import { $getNodeByKey, type LexicalEditor, type NodeKey } from "lexical";
import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui";
import { $createCodeNode, $isCodeNode } from "../CodeNode";
import { $isCodeSnippetNode, type CodeSnippetNode } from "./index";
import {
  canonicalCodeLanguage,
  codeLanguageLabel,
  getCodeLanguageOptions,
} from "../../utils/codeLanguage";
import { SNIPPET_HIDDEN_FILE_CLASS } from "./utils";
import * as css from "./styles.css";

const LANGUAGE_OPTIONS = getCodeLanguageOptions();

interface FileView {
  key: NodeKey;
  name: string;
  language: string;
}

interface SnippetView {
  files: FileView[];
  active: number;
}

const EMPTY: SnippetView = { files: [], active: 0 };

/** What the strip draws, read out of the node in one pass. */
function readSnippet(editor: LexicalEditor, nodeKey: NodeKey): SnippetView {
  return editor.getEditorState().read(() => {
    const node = $getNodeByKey(nodeKey);
    if (!$isCodeSnippetNode(node)) return EMPTY;
    return {
      active: node.getActiveIndex(),
      files: node.getChildren().map((child) => ({
        key: child.getKey(),
        name: $isCodeNode(child) ? child.getFilename() ?? "" : "",
        language: $isCodeNode(child) ? child.getLanguage() ?? "" : "",
      })),
    };
  });
}

/**
 * A cheap identity for a view, so typing inside a file does not re-render the
 * strip on every keystroke — one update listener fires for every edit in the
 * document, and only these four things change what is drawn.
 */
const signature = (view: SnippetView): string =>
  `${view.active}|${
    view.files
      .map((file) => `${file.key}:${file.name}:${file.language}`)
      .join(",")
  }`;

/** The tab label when a file has no name of its own. */
const labelOf = (file: FileView, index: number): string =>
  file.name || codeLanguageLabel(file.language || null) || `file ${index + 1}`;

export default function CodeSnippetTabs(
  { editor, nodeKey }: { editor: LexicalEditor; nodeKey: NodeKey },
) {
  const [view, setView] = useState<SnippetView>(() =>
    readSnippet(editor, nodeKey)
  );
  const [renaming, setRenaming] = useState<NodeKey | null>(null);

  /**
   * Show the open file and hide the rest, by class rather than by state.
   *
   * Which file is open is the node's `active`; this is only its consequence in
   * the DOM, which is why it is a class the reconciler may drop and never a
   * serialized field. Re-asserted from the update listener rather than from a
   * render effect, so that it survives the reconciliations that leave this
   * component's own output unchanged.
   */
  const syncVisibility = useCallback((): SnippetView => {
    const current = readSnippet(editor, nodeKey);
    current.files.forEach((file, index) => {
      editor.getElementByKey(file.key)?.classList.toggle(
        SNIPPET_HIDDEN_FILE_CLASS,
        index !== current.active,
      );
    });
    return current;
  }, [editor, nodeKey]);

  useEffect(() => {
    const apply = () => {
      const next = syncVisibility();
      setView((prev) => (signature(prev) === signature(next) ? prev : next));
    };
    apply();
    return editor.registerUpdateListener(apply);
  }, [editor, syncVisibility]);

  /** Every write goes through the host editor, on a node re-read by key. */
  const update = useCallback(
    (change: (node: CodeSnippetNode) => void) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isCodeSnippetNode(node)) change(node);
      });
    },
    [editor, nodeKey],
  );

  const select = (index: number) =>
    update((node) => node.setActiveIndex(index));

  const addFile = () =>
    update((node) => {
      const previous = node.getChildren().filter($isCodeNode).at(-1);
      const file = $createCodeNode(previous?.getLanguage() ?? "plain");
      file.setFilename(`file${node.getChildrenSize() + 1}`);
      node.append(file);
      node.setActiveIndex(node.getChildrenSize() - 1);
    });

  const removeFile = (index: number) =>
    update((node) => {
      // Never the last one: `canBeEmpty()` is false, so removing it would take
      // the snippet with it — a deletion nobody asked a button labelled "close
      // this file" for.
      if (node.getChildrenSize() < 2) return;
      node.getChildAtIndex(index)?.remove();
    });

  const rename = (index: number, name: string) =>
    update((node) => {
      const file = node.getChildAtIndex(index);
      if ($isCodeNode(file)) file.setFilename(name.trim());
    });

  const setLanguage = (language: string) =>
    update((node) => {
      const file = node.getChildAtIndex(node.getActiveIndex());
      if ($isCodeNode(file)) file.setLanguage(canonicalCodeLanguage(language));
    });

  if (view.files.length === 0) return null;
  const activeFile = view.files[view.active];

  return (
    // Preventing the press keeps the caret where it was: a mousedown inside a
    // contenteditable=false island still moves the DOM selection, and Lexical
    // then reads a selection that points at chrome.
    <div
      className={css.strip}
      onMouseDown={(event) => {
        if (renaming === null) event.preventDefault();
      }}
    >
      <div className={css.tabs} role="tablist">
        {view.files.map((file, index) => {
          const isActive = index === view.active;
          if (isActive && renaming === file.key) {
            return (
              <RenameField
                key={file.key}
                onCancel={() => setRenaming(null)}
                onCommit={(name) => {
                  rename(index, name);
                  setRenaming(null);
                }}
                value={file.name}
              />
            );
          }
          return (
            <span className={isActive ? css.tabActive : css.tab} key={file.key}>
              <button
                aria-selected={isActive}
                className={css.tabButton}
                onClick={() => (isActive ? setRenaming(file.key) : select(index))}
                role="tab"
                title={isActive ? "Rename this file" : labelOf(file, index)}
                type="button"
              >
                {labelOf(file, index)}
              </button>
              {isActive && view.files.length > 1 && (
                <button
                  aria-label={`Close ${labelOf(file, index)}`}
                  className={css.tabClose}
                  onClick={() => removeFile(index)}
                  title="Close this file"
                  type="button"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          );
        })}
        <button
          aria-label="Add a file"
          className={css.add}
          onClick={addFile}
          title="Add a file"
          type="button"
        >
          <Plus size={14} />
        </button>
      </div>

      <Select<string>
        onValueChange={(value) => value && setLanguage(value)}
        value={canonicalCodeLanguage(activeFile?.language ?? "") || "plain"}
      >
        <SelectTrigger
          aria-label="Language of the open file"
          className={css.language}
        >
          <SelectValue>
            {(value: string | null) => codeLanguageLabel(value)}
          </SelectValue>
        </SelectTrigger>
        {/* Item-aligned popups and focus restoration both fight a caret that
            belongs to the document rather than to this strip — the reasoning is
            written out in `ToolbarPlugin/Menus/BlockFormatSelect`. */}
        <SelectContent alignItemWithTrigger={false} finalFocus={false}>
          {LANGUAGE_OPTIONS.map(([value, label]) => (
            <SelectItem key={value} label={label} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** The active tab, while it is being renamed. Enter commits, Escape does not. */
function RenameField(
  { value, onCommit, onCancel }: {
    value: string;
    onCommit: (name: string) => void;
    onCancel: () => void;
  },
) {
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  return (
    <input
      aria-label="File name"
      className={css.rename}
      onBlur={() => onCommit(draft)}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(draft);
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
        // Arrows and Backspace in this field belong to the field: unstopped,
        // they would also reach the editor and move the document's caret.
        event.stopPropagation();
      }}
      placeholder="file name"
      ref={input}
      value={draft}
    />
  );
}
