"use client";
/**
 * The live half of the code block's card
 * (docs/plans/archive/code-block-card.md).
 *
 * The card — header, body, status footer, caret wash — is DOM that
 * `CodeNode.createDOM` builds and `CodeNode.exportDOM` mirrors, so the reader
 * gets it with no plugin involved. What is left here is only what an editor can
 * supply: the language `Select` portalled into the slot the header left empty;
 * one delegated `click` on the root (`copy`/`collapse` go to the shared
 * `actions.ts`, `wrap` stays here because it writes node state); a
 * `ResizeObserver` per body, so whether a block is long enough to offer
 * collapse is re-answered when `__wrap` or `__width` changes its height rather
 * than measured once (§4.3); and Ln/Col, the line count and the caret wash.
 *
 * **What is gone.** This plugin used to portal a header and a footer into the
 * editor's nearest scrollable ancestor and position them over each block by
 * bounding rect, recomputed on every update, scroll and resize — with
 * `findScrollContainer`, `rectToContainerSpace`, `HEADER_HEIGHT`/
 * `FOOTER_HEIGHT`, a dev warning about `position: static` scrollers, and a
 * zero-rect guard for snippet files that are `display: none`. All of it existed
 * to make a floating layer track a block it was not part of.
 */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getNearestNodeFromDOMNode,
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
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { $isCodeNode, CodeNode } from "@/editor/nodes/CodeNode";
import {
  ACTIVE_CLASS,
  CAN_COLLAPSE_CLASS,
  CARD_ACTIVE_LINE_CLASS,
  CARD_BODY_CLASS,
  CARD_CHROME_ATTR,
  CARD_FOOT_CLASS,
  CARD_GLYPH_CLASS,
  CARD_HEAD_CLASS,
  CARD_LANG_CLASS,
} from "@/editor/nodes/CodeNode/card";
import {
  findCodeCardAction,
  runCodeCardAction,
} from "@/editor/nodes/CodeNode/actions";
import {
  collapsedBodyHeightPx,
  exceedsCollapseThreshold,
} from "@/editor/nodes/CodeNode/collapse";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/editor/ui";
import {
  canonicalCodeLanguage,
  codeLanguageGlyph,
  codeLanguageLabel,
  getCodeLanguageOptions,
} from "@/editor/utils/codeLanguage";

const CODE_LANGUAGE_OPTIONS = getCodeLanguageOptions();

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

const child = (card: HTMLElement, className: string) =>
  card.querySelector<HTMLElement>(`:scope > .${className}`);

/** The measured line height of a card body, or 0 if it cannot be read. */
function bodyLineHeight(body: HTMLElement): number {
  const parsed = parseFloat(window.getComputedStyle(body).lineHeight);
  return Number.isFinite(parsed) ? parsed : 0;
}

/* ----------------------- language dropdown ----------------------- */

/**
 * The header's language control: the same Base UI `Select` the snippet's tab
 * strip uses.
 *
 * §7.1 asked what a `Select` nested in node DOM does, and the answer is that
 * this is the nesting the strip has shipped in since haklex-reprise phase 5.
 * All three of its requirements carry over and all three are load-bearing:
 * `alignItemWithTrigger={false}` (an item-aligned popup measures against a
 * trigger inside a `contentEditable`), `finalFocus={false}` (restoring focus to
 * the trigger on close steals the caret from the document), and the `mousedown`
 * guard (a press inside a `contentEditable=false` island still moves the DOM
 * selection, and Lexical then reads a selection pointing at chrome).
 */
function LanguageSelect(
  { editor, nodeKey, language }: {
    editor: LexicalEditor;
    nodeKey: NodeKey;
    language: string;
  },
) {
  const setLanguage = useCallback((value: string) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isCodeNode(node)) node.setLanguage(canonicalCodeLanguage(value));
    });
  }, [editor, nodeKey]);

  return (
    <span onMouseDown={(event) => event.preventDefault()}>
      <Select<string>
        onValueChange={(value) => value && setLanguage(value)}
        value={canonicalCodeLanguage(language) || "plain"}
      >
        <SelectTrigger
          aria-label="Code language"
          className="code-card-lang-trigger"
        >
          <SelectValue className="code-card-lang-value">
            {(value: string | null) => {
              const glyph = codeLanguageGlyph(value);
              return (
                <>
                  <span
                    className={CARD_GLYPH_CLASS}
                    style={{
                      // Brand colours, declared as such — see the note above
                      // `GLYPH_MAP` in `utils/codeLanguage.ts`.
                      ["--code-glyph-bg" as string]: glyph.bg,
                      ["--code-glyph-fg" as string]: glyph.fg,
                    }}
                  >
                    {glyph.text}
                  </span>
                  <span>{codeLanguageLabel(value)}</span>
                </>
              );
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} finalFocus={false}>
          {CODE_LANGUAGE_OPTIONS.map(([value, label]) => (
            <SelectItem key={value} label={label} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </span>
  );
}

/* --------------------------- plugin ------------------------------ */

export default function CodeActionMenuPlugin() {
  const [editor] = useLexicalComposerContext();
  const [keys, setKeys] = useState<NodeKey[]>([]);
  /** Bumped when the root element is rebuilt, which invalidates every host. */
  const [generation, setGeneration] = useState(0);
  /** The language each card's `Select` should show, by node key. */
  const [languages, setLanguages] = useState<Record<NodeKey, string>>({});
  const activeCard = useRef<HTMLElement | null>(null);

  // Track which code blocks exist, and what language each one is in. Seeded
  // from the current state because a mutation listener does not replay
  // creations for nodes that were already there on load.
  const known = useRef<Record<NodeKey, string>>({});
  useEffect(() => {
    const track = () => {
      const next = editor.getEditorState().read(() => {
        const found: Record<NodeKey, string> = {};
        for (const node of $nodesOfType(CodeNode)) {
          found[node.getKey()] = node.getLanguage() ?? "";
        }
        return found;
      });
      const prev = known.current;
      const nextKeys = Object.keys(next);
      const unchanged = Object.keys(prev).length === nextKeys.length &&
        nextKeys.every((key) => prev[key] === next[key]);
      if (unchanged) return;
      known.current = next;
      setLanguages(next);
      setKeys(nextKeys);
    };
    track();
    return editor.registerMutationListener(CodeNode, track);
  }, [editor]);

  /**
   * One delegated listener for the whole editor, mirroring the one `/view`
   * binds over its container. `copy` and `collapse` are the shared
   * implementation; `wrap` is the only action that needs an editor.
   *
   * Bubble phase, and it stops nothing. A capture-phase listener here would run
   * *before* React's own delegated dispatch — which is attached above the
   * editor root — so stopping propagation would silence the language `Select`
   * along with everything else. Caret theft is headed off at `mousedown`
   * instead, the same guard `CodeSnippetTabs` uses for the same reason.
   */
  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Element && target.closest(`[${CARD_CHROME_ATTR}]`)
      ) {
        event.preventDefault();
      }
    };

    const onClick = (event: MouseEvent) => {
      const hit = findCodeCardAction(event.target);
      if (!hit || runCodeCardAction(hit)) return;
      if (hit.action !== "wrap") return;
      editor.update(() => {
        const node = $getNearestNodeFromDOMNode(hit.card);
        if ($isCodeNode(node)) node.setWrap(!node.getWrap());
      });
    };

    return editor.registerRootListener((root, prevRoot) => {
      prevRoot?.removeEventListener("mousedown", onMouseDown);
      prevRoot?.removeEventListener("click", onClick);
      root?.addEventListener("mousedown", onMouseDown);
      root?.addEventListener("click", onClick);
      setGeneration((n) => n + 1);
    });
  }, [editor]);

  /**
   * Whether each block is long enough to be worth collapsing, re-answered
   * whenever its body changes height — which `__wrap` and `__width` both do,
   * and which a one-shot measurement would miss (§4.3).
   */
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const body = entry.target as HTMLElement;
        const card = body.parentElement;
        if (!card) continue;
        const lineHeight = bodyLineHeight(body);
        // `scrollHeight`, not the observed box: once collapsed the box is the
        // clamp, and measuring that would answer "is the collapsed height
        // taller than the collapse threshold" — always no, so the control the
        // reader just used would vanish under them.
        card.classList.toggle(
          CAN_COLLAPSE_CLASS,
          exceedsCollapseThreshold(body.scrollHeight, lineHeight),
        );
        // The clamp itself, from the measured line height rather than from the
        // stylesheet's guess at it. `/view` keeps the CSS default.
        card.style.setProperty(
          "--code-collapsed-h",
          `${collapsedBodyHeightPx(lineHeight)}px`,
        );
      }
    });
    for (const key of keys) {
      const card = editor.getElementByKey(key);
      const body = card && child(card, CARD_BODY_CLASS);
      if (body) observer.observe(body);
    }
    return () => observer.disconnect();
  }, [editor, keys, generation]);

  /**
   * The status footer and the caret wash — written straight into the elements
   * `createDOM` reserved rather than re-rendered, since this runs on every
   * editor update.
   */
  useEffect(() => {
    const paint = () =>
      editor.getEditorState().read(() => {
        const previous = activeCard.current;
        if (previous) previous.classList.remove(ACTIVE_CLASS);
        activeCard.current = null;

        for (const key of Object.keys(languages)) {
          const card = editor.getElementByKey(key);
          const lines = card?.querySelector<HTMLElement>(".code-card-lines");
          if (!card || !lines) continue;
          const node = $getNodeByKey(key);
          if (!$isCodeNode(node)) continue;
          const text = node.getTextContent();
          const count = text.length === 0 ? 1 : text.split("\n").length;
          lines.textContent = `${count} ${count === 1 ? "line" : "lines"}`;
        }

        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
        const codeNode = $findCodeNode(selection.anchor.getNode());
        if (!codeNode) return;
        const card = editor.getElementByKey(codeNode.getKey());
        if (!card) return;

        const { line, col } = $caretLineCol(codeNode, selection.anchor);
        const footer = child(card, CARD_FOOT_CLASS);
        const caret = footer?.querySelector<HTMLElement>(".code-card-caret");
        if (caret) caret.textContent = `Ln ${line}, Col ${col}`;

        card.classList.add(ACTIVE_CLASS);
        activeCard.current = card;

        // The one measurement left in this file. Against the card, which is the
        // caret's own offset parent — no scroll container to find, no portal
        // coordinate space to convert into, and nothing to recompute on scroll.
        const wash = child(card, CARD_ACTIVE_LINE_CLASS);
        const domSelection = window.getSelection();
        if (!wash || !domSelection || domSelection.rangeCount === 0) return;
        const rect = domSelection.getRangeAt(0).getBoundingClientRect();
        if (rect.height === 0) return;
        const cardRect = card.getBoundingClientRect();
        wash.style.top = `${rect.top - cardRect.top - card.clientTop}px`;
        wash.style.height = `${rect.height}px`;
      });

    paint();
    return editor.registerUpdateListener(paint);
  }, [editor, languages]);

  // Read so that a root rebuild re-runs the host lookups below; the value
  // itself means nothing.
  void generation;

  return (
    <>
      {keys.map((key) => {
        // Resolved during render and never cached, for the reason
        // `CodeSnippetPlugin` gives: a cached host outlives the DOM it pointed
        // at, and React would go on portalling into a detached element. Absent
        // for a block whose parent draws its own heading — a snippet file or a
        // layout column — which has no header to portal into.
        const host = editor.getElementByKey(key)?.querySelector<HTMLElement>(
          `:scope > .${CARD_HEAD_CLASS} > .${CARD_LANG_CLASS}`,
        );
        if (!host) return null;
        return createPortal(
          <LanguageSelect
            editor={editor}
            language={languages[key] ?? ""}
            nodeKey={key}
          />,
          host,
          key,
        );
      })}
    </>
  );
}
