"use client";
/**
 * CodeActionMenuPlugin
 *
 * Renders the authoring chrome for `CodeNode` blocks in edit mode — a head bar
 * (language dropdown + word-wrap toggle + copy), a status footer (Ln/Col, line
 * count, indentation, encoding) and an active-line highlight.
 *
 * Lexical owns the contentEditable DOM of each code block, so we cannot inject
 * chrome as child elements without fighting reconciliation. Instead we portal
 * the chrome to `document.body` and position it over each block using the
 * block's bounding rect, recomputing on editor updates, scroll and resize. The
 * code block reserves top/bottom padding (see theme.css) so the head/footer
 * never cover code, and the gutter stays aligned.
 */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getNodeByKey,
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  $isTabNode,
  $isTextNode,
  $nodesOfType,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type Point,
} from "lexical";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { $isCodeNode, CodeNode } from "@/editor/nodes/CodeNode";
import {
  canonicalCodeLanguage,
  codeLanguageGlyph,
  codeLanguageLabel,
  getCodeLanguageOptions,
} from "@/editor/utils/codeLanguage";

const HEADER_HEIGHT = 46;
const FOOTER_HEIGHT = 32;
const CODE_LANGUAGE_OPTIONS = getCodeLanguageOptions();

interface ActiveCaret {
  key: NodeKey;
  line: number;
  col: number;
  /** Page-space top of the caret line (viewport top + scrollY at capture). */
  lineTop: number;
  lineHeight: number;
}

/* ----------------------------- icons ----------------------------- */

const CopyIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M5 15.5A2.5 2.5 0 0 1 4 13.5v-7A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 15.5 5" />
  </svg>
);

const CheckIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 12.5 9 17.5 20 6.5" />
  </svg>
);

const WrapIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 6h18M3 12h13a3.5 3.5 0 0 1 0 7h-3.5M3 18h4" />
    <path d="m9.5 15.5-2.5 2.5 2.5 2.5" />
  </svg>
);

const ChevronIcon = () => (
  <svg
    className="code-chevron"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 9.5 12 15.5 18 9.5" />
  </svg>
);

const TickIcon = () => (
  <svg
    className="code-tick"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 12.5 9 17.5 20 6.5" />
  </svg>
);

/* --------------------------- helpers ----------------------------- */

function nodeSegmentText(node: LexicalNode): string {
  if ($isLineBreakNode(node)) return "\n";
  if ($isTabNode(node)) return "\t";
  return node.getTextContent();
}

/** Nearest enclosing CodeNode for a node, or null. */
function $findCodeNode(node: LexicalNode | null): CodeNode | null {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isCodeNode(current)) return current;
    current = current.getParent();
  }
  return null;
}

/** 1-based line/column of a caret point within a (flat) code block. */
function $caretLineCol(
  codeNode: CodeNode,
  anchor: Point,
): { line: number; col: number } {
  const children = codeNode.getChildren();
  let prefix = "";

  if (anchor.type === "element" && anchor.key === codeNode.getKey()) {
    for (let i = 0; i < anchor.offset && i < children.length; i++) {
      prefix += nodeSegmentText(children[i]);
    }
  } else {
    for (const child of children) {
      if (child.getKey() === anchor.key) {
        if ($isTextNode(child)) {
          prefix += child.getTextContent().slice(0, anchor.offset);
        }
        break;
      }
      prefix += nodeSegmentText(child);
    }
  }

  const lines = prefix.split("\n");
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

/* ----------------------- language dropdown ----------------------- */

function LanguageDropdown(
  { editor, nodeKey, language }: {
    editor: LexicalEditor;
    nodeKey: NodeKey;
    language: string;
  },
) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = canonicalCodeLanguage(language);
  const glyph = codeLanguageGlyph(language);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const select = useCallback((id: string) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isCodeNode(node)) node.setLanguage(id);
    });
    setOpen(false);
  }, [editor, nodeKey]);

  return (
    <div
      className={`code-lang-select${open ? " open" : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="code-lang-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="code-lang-glyph"
          style={{
            ["--code-glyph-bg" as string]: glyph.bg,
            ["--code-glyph-fg" as string]: glyph.fg,
          } as CSSProperties}
        >
          {glyph.text}
        </span>
        <span>{codeLanguageLabel(language)}</span>
        <ChevronIcon />
      </button>
      {open && (
        <div className="code-lang-menu" role="listbox">
          {CODE_LANGUAGE_OPTIONS.map(([id, name]) => (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={canonicalCodeLanguage(id) === current}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(id)}
            >
              <span>{name}</span>
              <TickIcon />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------- block chrome -------------------------- */

function CodeBlockChrome(
  { editor, nodeKey, element, caret, reflow }: {
    editor: LexicalEditor;
    nodeKey: NodeKey;
    element: HTMLElement;
    caret: ActiveCaret | null;
    reflow: number;
  },
) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Read node-derived data (re-evaluated whenever reflow changes).
  const data = editor.getEditorState().read(() => {
    const node = $getNodeByKey(nodeKey);
    if (!$isCodeNode(node)) return null;
    const text = node.getTextContent();
    return {
      language: node.getLanguage() ?? "",
      wrap: node.getWrap(),
      lineCount: text.length === 0 ? 1 : text.split("\n").length,
    };
  });

  const toggleWrap = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isCodeNode(node)) node.setWrap(!node.getWrap());
    });
  }, [editor, nodeKey]);

  const copy = useCallback(() => {
    const text = element.innerText;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [element]);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  // Skip layout-column code blocks: they keep the compact, chrome-less look.
  if (!data || element.closest(".LexicalTheme__layoutItem")) return null;

  // reflow participates in positioning by forcing a re-render + re-measure.
  void reflow;
  const rect = element.getBoundingClientRect();
  const top = rect.top + window.scrollY;
  const left = rect.left + window.scrollX;
  const width = rect.width;

  const headerStyle: CSSProperties = {
    top,
    left,
    width,
    height: HEADER_HEIGHT,
  };
  const footerStyle: CSSProperties = {
    top: top + rect.height - FOOTER_HEIGHT,
    left,
    width,
    height: FOOTER_HEIGHT,
  };
  const isActive = caret?.key === nodeKey;
  const isDark = element.closest('[theme="dark"]') !== null ||
    (typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"));

  return (
    <div className={`code-edit-chrome${isDark ? " is-dark" : ""}`}>
      {isActive && caret && (
        <div
          className="code-edit-active-line"
          style={{
            top: caret.lineTop,
            left,
            width,
            height: caret.lineHeight,
          }}
        />
      )}
      <div className="code-edit-header" style={headerStyle}>
        <LanguageDropdown
          editor={editor}
          nodeKey={nodeKey}
          language={data.language}
        />
        <span className="code-head-spacer" />
        <div className="code-edit-actions">
          <button
            type="button"
            className={`code-edit-iconbtn${data.wrap ? " is-on" : ""}`}
            aria-label="Toggle word wrap"
            title="Word wrap"
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleWrap}
          >
            <WrapIcon />
          </button>
          <button
            type="button"
            className={`code-edit-iconbtn${copied ? " copied" : ""}`}
            aria-label="Copy code"
            title="Copy"
            onMouseDown={(e) => e.preventDefault()}
            onClick={copy}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
      </div>
      <div className="code-edit-footer" style={footerStyle}>
        {isActive && caret
          ? <span>Ln {caret.line}, Col {caret.col}</span>
          : <span>Ln —, Col —</span>}
        <span className="code-foot-sep" />
        <span>
          {data.lineCount} {data.lineCount === 1 ? "line" : "lines"}
        </span>
        <span className="code-foot-grow" />
        <span>Spaces: 2</span>
        <span className="code-foot-sep" />
        <span>UTF-8</span>
      </div>
    </div>
  );
}

/* --------------------------- plugin ------------------------------ */

export default function CodeActionMenuPlugin(
  { anchorElem }: { anchorElem?: HTMLElement } = {},
) {
  const [editor] = useLexicalComposerContext();
  const [codeKeys, setCodeKeys] = useState<NodeKey[]>([]);
  const [caret, setCaret] = useState<ActiveCaret | null>(null);
  const [reflow, setReflow] = useState(0);
  const keysRef = useRef<Set<NodeKey>>(new Set());
  const rafRef = useRef(0);

  const scheduleReflow = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setReflow((v) => v + 1));
  }, []);

  // Track which CodeNode keys exist.
  useEffect(() => {
    // Seed with code blocks already present on load (mutation listeners may
    // not replay creations for pre-existing nodes).
    editor.getEditorState().read(() => {
      const set = keysRef.current;
      let changed = false;
      for (const node of $nodesOfType(CodeNode)) {
        if (!set.has(node.getKey())) {
          set.add(node.getKey());
          changed = true;
        }
      }
      if (changed) setCodeKeys(Array.from(set));
    });

    return editor.registerMutationListener(CodeNode, (mutations) => {
      const set = keysRef.current;
      let changed = false;
      for (const [key, type] of mutations) {
        if (type === "destroyed") {
          if (set.delete(key)) changed = true;
        } else if (!set.has(key)) {
          set.add(key);
          changed = true;
        }
      }
      if (changed) setCodeKeys(Array.from(set));
      scheduleReflow();
    });
  }, [editor, scheduleReflow]);

  // Track caret position within the active code block + trigger reposition.
  useEffect(() => {
    const readCaret = () => {
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          setCaret(null);
          return;
        }
        const codeNode = $findCodeNode(selection.anchor.getNode());
        if (!codeNode) {
          setCaret(null);
          return;
        }
        const { line, col } = $caretLineCol(codeNode, selection.anchor);

        let lineTop = 0;
        let lineHeight = 22;
        const domSel = window.getSelection();
        if (domSel && domSel.rangeCount > 0) {
          const rect = domSel.getRangeAt(0).getBoundingClientRect();
          if (rect.height > 0) {
            lineTop = rect.top + window.scrollY;
            lineHeight = rect.height;
          } else {
            const el = editor.getElementByKey(codeNode.getKey());
            if (el) {
              const cs = window.getComputedStyle(el);
              lineHeight = parseFloat(cs.lineHeight) || 22;
              lineTop = el.getBoundingClientRect().top + window.scrollY +
                HEADER_HEIGHT + (line - 1) * lineHeight;
            }
          }
        }
        setCaret({ key: codeNode.getKey(), line, col, lineTop, lineHeight });
      });
    };

    return mergeRegister(
      editor.registerUpdateListener(() => {
        readCaret();
        scheduleReflow();
      }),
    );
  }, [editor, scheduleReflow]);

  // Reposition on scroll / resize.
  useEffect(() => {
    const onScroll = () => scheduleReflow();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [scheduleReflow]);

  const container = anchorElem ??
    (typeof document !== "undefined" ? document.body : null);
  if (!container) return null;

  return createPortal(
    <>
      {codeKeys.map((key) => {
        const element = editor.getElementByKey(key);
        if (!element) return null;
        return (
          <CodeBlockChrome
            key={key}
            editor={editor}
            nodeKey={key}
            element={element}
            caret={caret}
            reflow={reflow}
          />
        );
      })}
    </>,
    container,
  );
}
