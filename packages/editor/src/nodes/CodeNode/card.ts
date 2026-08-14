/**
 * The code block's card — its DOM contract, and the one builder that emits it
 * (docs/plans/code-block-card.md §2).
 *
 * **Why the chrome is a child and not an overlay.** It used to be two overlays,
 * and `CodeActionMenuPlugin`'s own header comment gave the reason: "Lexical
 * owns the contentEditable DOM of each code block, so we cannot inject chrome
 * as child elements without fighting reconciliation". That stopped being true
 * when `CodeSnippetNode` shipped — `createDOM` sets a host element aside and
 * `getDOMSlot(element).withElement(body)` points reconciliation at a *different*
 * child, so anything outside the slot is the node's to keep. `CodeNode` makes
 * the same two calls, and the chrome now scrolls, wraps, prints and exports
 * with the block because it *is* the block.
 *
 * **One builder, two surfaces.** `createDOM` (editor) and `exportDOM` (`/view`,
 * print, the export bundles) both call {@link buildCardHeader}; the copy
 * button, its 1500 ms reset, the glyph chip and the header layout used to exist
 * twice, once in JSX and once in imperative DOM, and had drifted in both
 * directions. They differ in one flag — `interactive` — and in nothing else.
 * Whether the *collapse* control is offered is not a flag: the button is always
 * built and {@link CAN_COLLAPSE_CLASS} decides whether it shows, so the
 * editor's `ResizeObserver` can change the answer under the author's hands.
 *
 * **Behaviour is bound by delegation, never here.** Nothing in this file
 * attaches a listener; every control carries {@link CODE_ACTION_ATTR} and one
 * listener per surface reads it (`actions.ts`). A header emitted into static
 * HTML therefore works the moment something delegates over it, which is what
 * let `ViewCodeEnhancer` go (§4.2).
 */
import {
  codeLanguageGlyph,
  codeLanguageLabel,
} from "../../utils/codeLanguage";

/* ------------------------- the DOM contract ------------------------- */

/**
 * These class names are a contract between five files that do not import each
 * other: this builder, `CodeNode` (which slots children into the body),
 * `CodeActionMenuPlugin` (which drives the live half), `actions.ts` (which
 * delegates over them) and `theme.css` (which lays all of it out for editor and
 * reader alike). Rename one here, not there.
 */
export const CARD_HEAD_CLASS = "code-card-head";
export const CARD_BODY_CLASS = "code-card-body";
export const CARD_FOOT_CLASS = "code-card-foot";
export const CARD_ACTIVE_LINE_CLASS = "code-card-active-line";
/** The language slot: a static chip for the reader, a `Select` host in the editor. */
export const CARD_LANG_CLASS = "code-card-lang";
export const CARD_GLYPH_CLASS = "code-card-glyph";
export const CARD_FILENAME_CLASS = "code-card-filename";
const CARD_BUTTON_CLASS = "code-card-btn";
/** Divides the identity half of the header from the actions half. */
const CARD_SPACER_CLASS = "code-card-spacer";

/** On the code element while a header is present — the gutter reads it. */
export const HAS_HEAD_CLASS = "has-card-head";
/** On the code element while the editor's status footer is present. */
export const HAS_FOOT_CLASS = "has-card-foot";

/**
 * Collapsed-ness, as a class on the element and **nowhere else** (§4.3).
 *
 * It is a view preference, not content. In `exportJSON` it would be one
 * author's editing convenience persisted into every reader's copy, and it would
 * cost a `check:nodes` arm and a migration for a preference — so it lives here,
 * ephemeral and per element, exactly where `ViewCodeEnhancer` had it right.
 * `__tests__/codeCard.test.ts` pins that it never reaches the JSON — toggled
 * through the real delegated listener, against the real exported markup.
 */
export const COLLAPSED_CLASS = "is-collapsed";

/** On the code element while the block is long enough to be worth collapsing. */
export const CAN_COLLAPSE_CLASS = "can-collapse";

/** On the code element while the caret is inside it. */
export const ACTIVE_CLASS = "is-active";

/** What a control does. Read by `actions.ts`; see {@link CodeCardAction}. */
export const CODE_ACTION_ATTR = "data-code-action";

/**
 * On every element of the card that is chrome rather than code.
 *
 * `NodeSelectionPlugin` selects a code block when the click lands within the
 * gutter's width of its left edge, and the header shares that left edge — so
 * without a marker the language dropdown would be a node-selection gesture.
 */
export const CARD_CHROME_ATTR = "data-code-card-chrome";

export type CodeCardAction = "copy" | "collapse" | "wrap";

/* ---------------------- who gets no header at all -------------------- */

/**
 * Node types whose children draw their own heading, by parent type string.
 *
 * - `code-snippet` (§4.1) — the tab strip **is** the header, and its tabs are
 *   these very filenames. A card header on each file would be a second header
 *   directly under the first, repeating the name it just showed.
 * - `layout-item` — a code block in a layout column has always been chrome-less
 *   and gutter-less, for symmetry between the columns. Both old chromes skipped
 *   it by looking for `.LexicalTheme__layoutItem` with `closest()`.
 *
 * §4.1 speaks of the header; the status footer and the caret wash follow it
 * because they hang off the same two edges. The cost is that a file inside a
 * snippet has nowhere to put a collapse control — the body is still
 * collapsible, nothing offers it.
 *
 * **The node decides this, not CSS.** `exportDOM` has to make the same call and
 * has no parent selector to ask: the element is not in a tree yet. Compared by
 * type string rather than `instanceof`, for the reason
 * `CodeSnippetNode/guard.ts` gives — importing either class would close a cycle
 * for the sake of naming it.
 */
const CHROMELESS_PARENT_TYPES: ReadonlySet<string> = new Set([
  "code-snippet",
  "layout-item",
]);

export function suppressesCardChrome(parentType: string | undefined): boolean {
  return parentType !== undefined && CHROMELESS_PARENT_TYPES.has(parentType);
}

/* ------------------------------ icons -------------------------------- */

const svg = (body: string, width = 1.7) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const COPY_ICON = svg(
  '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15.5A2.5 2.5 0 0 1 4 13.5v-7A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 15.5 5"/>',
);

export const CHECK_ICON = svg('<path d="M4 12.5 9 17.5 20 6.5"/>', 2);

const WRAP_ICON = svg(
  '<path d="M3 6h18M3 12h13a3.5 3.5 0 0 1 0 7h-3.5M3 18h4"/><path d="m9.5 15.5-2.5 2.5 2.5 2.5"/>',
);

const CHEVRON_ICON =
  `<svg class="code-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 14.5 12 8.5 18 14.5"/></svg>`;

/* ---------------------------- the builder ---------------------------- */

/** A chrome element: marked as such, and never editable. */
function chrome<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.setAttribute(CARD_CHROME_ATTR, "");
  element.contentEditable = "false";
  return element;
}

function actionButton(
  action: CodeCardAction,
  label: string,
  html: string,
  extraClass = "",
): HTMLButtonElement {
  const button = chrome("button", `${CARD_BUTTON_CLASS} ${extraClass}`.trim());
  button.type = "button";
  button.setAttribute(CODE_ACTION_ATTR, action);
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = html;
  return button;
}

interface CardHeaderOptions {
  /** The block's language id, as stored. */
  language?: string;
  /** Rendered when set — phase 5 stored it and nothing displayed it (§1). */
  filename?: string;
  /**
   * The editor's header: an empty language slot for the portalled `Select`,
   * plus the word-wrap toggle. The reader's is `false`.
   */
  interactive: boolean;
}

/**
 * The card's header. Callers are `CodeNode.createDOM` and `CodeNode.exportDOM`,
 * and no third one should appear: a header built anywhere else is the drift
 * this plan exists to undo.
 */
export function buildCardHeader(options: CardHeaderOptions): HTMLElement {
  const header = chrome("div", CARD_HEAD_CLASS);

  const language = chrome("span", CARD_LANG_CLASS);
  // Empty in the editor: `CodeActionMenuPlugin` portals a Base UI `Select`
  // into it. A React portal appends rather than replaces, so the static chip
  // must not be here to begin with — the slot is the handover.
  if (!options.interactive) {
    const glyph = codeLanguageGlyph(options.language ?? null);
    const chip = document.createElement("span");
    chip.className = CARD_GLYPH_CLASS;
    chip.textContent = glyph.text;
    // Brand colours as inline custom properties — declared, not overlooked.
    // See the note above `GLYPH_MAP` in `utils/codeLanguage.ts`.
    chip.style.setProperty("--code-glyph-bg", glyph.bg);
    chip.style.setProperty("--code-glyph-fg", glyph.fg);
    const label = document.createElement("span");
    label.textContent = codeLanguageLabel(options.language ?? null);
    language.append(chip, label);
  }
  header.append(language);

  const spacer = document.createElement("span");
  spacer.className = CARD_SPACER_CLASS;
  header.append(spacer);
  setCardFilename(header, options.filename);

  const actions = chrome("div", "code-card-actions");
  if (options.interactive) {
    actions.append(actionButton("wrap", "Word wrap", WRAP_ICON));
  }
  actions.append(
    actionButton(
      "copy",
      "Copy code",
      `${COPY_ICON}<span class="code-card-btn-label">Copy</span>`,
    ),
  );
  actions.append(
    actionButton("collapse", "Collapse code", CHEVRON_ICON, "code-card-fold"),
  );
  header.append(actions);

  return header;
}

/**
 * Show, update or remove the header's filename, in place.
 *
 * haklex-reprise phase 5 plumbed `filename` end to end and gave it a UI only in
 * the snippet's tab strip, so a standalone block could carry a name nothing
 * displayed (§1). This is that display — rendering only; §7.3 keeps adding an
 * edit affordance a separate decision.
 *
 * Patched rather than rebuilt because `CodeNode.updateDOM` calls it on every
 * rename, and replacing the header would detach the element the language
 * `Select` is portalled into.
 */
export function setCardFilename(
  header: HTMLElement,
  filename: string | undefined,
): void {
  const existing = header.querySelector<HTMLElement>(
    `:scope > .${CARD_FILENAME_CLASS}`,
  );
  if (!filename) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.textContent = filename;
    return;
  }
  const element = document.createElement("span");
  element.className = CARD_FILENAME_CLASS;
  element.textContent = filename;
  header.querySelector(`:scope > .${CARD_SPACER_CLASS}`)?.before(element);
}

/** The scroll region children reconcile into — the node's `getDOMSlot` target. */
export function buildCardBody(): HTMLElement {
  const body = document.createElement("div");
  body.className = CARD_BODY_CLASS;
  return body;
}

/**
 * The editor's status strip: Ln/Col, line count, indentation, encoding.
 *
 * Built by `createDOM` and never by `exportDOM` — "Ln —, Col —" in a published
 * article is a cursor position no reader has. `CodeActionMenuPlugin` writes the
 * text; this reserves the boxes, so a caret move is two `textContent` writes.
 */
export function buildCardFooter(): HTMLElement {
  const footer = chrome("div", CARD_FOOT_CLASS);
  const caret = document.createElement("span");
  caret.className = "code-card-caret";
  caret.textContent = "Ln —, Col —";
  const lines = document.createElement("span");
  lines.className = "code-card-lines";
  const grow = document.createElement("span");
  grow.className = "code-card-foot-grow";
  const trailing = document.createElement("span");
  trailing.textContent = "Spaces: 2 · UTF-8";
  footer.append(caret, sep(), lines, grow, trailing);
  return footer;
}

function sep(): HTMLElement {
  const element = document.createElement("span");
  element.className = "code-card-foot-sep";
  return element;
}

/** The caret-line wash. Positioned by the plugin, invisible until it is. */
export function buildActiveLine(): HTMLElement {
  const line = chrome("div", CARD_ACTIVE_LINE_CLASS);
  return line;
}
