/**
 * What a click on the card's chrome does — once, for both surfaces
 * (docs/plans/archive/code-block-card.md §4.2).
 *
 * A published article is `$generateHtmlFromNodes` output with no event handlers
 * in it, so the reader's header would be inert if behaviour lived on the
 * element. Instead **one delegated listener per surface** reads
 * `data-code-action` off whatever was clicked and calls in here. That is what
 * retired `ViewCodeEnhancer`, which existed to *build* a header on `/view`, per
 * block, re-run by a `MutationObserver` racing hydration.
 *
 * `copy` and `collapse` are pure DOM and live here. `wrap` writes node state,
 * so the editor's listener keeps that one — this module never imports Lexical,
 * and a reader has nothing to write to.
 */
import {
  CARD_BODY_CLASS,
  CARD_HEAD_CLASS,
  CHECK_ICON,
  CODE_ACTION_ATTR,
  type CodeCardAction,
  COLLAPSED_CLASS,
  COPY_ICON,
} from "./card";

interface CodeCardHit {
  action: CodeCardAction;
  /** The code element itself — the card is the block. */
  card: HTMLElement;
  button: HTMLElement;
}

/**
 * The action a click landed on, or null for anything else. The card is found as
 * the header's parent rather than by `config.theme.code`, which is configurable
 * and must not be what breaks when someone renames it.
 */
export function findCodeCardAction(
  target: EventTarget | null,
): CodeCardHit | null {
  if (!(target instanceof Element)) return null;
  const button = target.closest<HTMLElement>(`[${CODE_ACTION_ATTR}]`);
  const action = button?.getAttribute(CODE_ACTION_ATTR);
  if (!button || !action) return null;
  const card = button.closest(`.${CARD_HEAD_CLASS}`)?.parentElement;
  if (!(card instanceof HTMLElement)) return null;
  return { action: action as CodeCardAction, card, button };
}

/** The copy button's 1500 ms reset. A `WeakMap`, so a header replaced by
 * reconciliation takes its pending timer's only reference with it. */
const resetTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

function setCopyLabel(button: HTMLElement, copied: boolean): void {
  button.classList.toggle("is-copied", copied);
  button.innerHTML = `${copied ? CHECK_ICON : COPY_ICON}<span class="code-card-btn-label">${
    copied ? "Copied" : "Copy"
  }</span>`;
}

/**
 * Run `copy` or `collapse`; `false` means the caller owns it — in practice
 * `wrap`, which only the editor can honour.
 */
export function runCodeCardAction(hit: CodeCardHit): boolean {
  if (hit.action === "copy") {
    // The body, not the card: the card contains the header now, and
    // `innerText` on it would copy the language name and the word "Copy" with
    // the code. Inside the body it is still right — it keeps rendered line
    // breaks and excludes the gutter, which is a `::before`.
    const body = hit.card.querySelector<HTMLElement>(`:scope > .${CARD_BODY_CLASS}`);
    const text = (body ?? hit.card).innerText;
    void navigator.clipboard?.writeText(text).then(() => {
      setCopyLabel(hit.button, true);
      const pending = resetTimers.get(hit.button);
      if (pending) clearTimeout(pending);
      resetTimers.set(
        hit.button,
        setTimeout(() => setCopyLabel(hit.button, false), 1500),
      );
    }).catch(() => {});
    return true;
  }

  if (hit.action === "collapse") {
    const collapsed = hit.card.classList.toggle(COLLAPSED_CLASS);
    const label = collapsed ? "Expand code" : "Collapse code";
    hit.button.setAttribute("aria-label", label);
    hit.button.title = label;
    return true;
  }

  return false;
}

/** The whole of `/view`'s side of the card. Returns its own teardown. */
export function registerCodeCardActions(container: HTMLElement): () => void {
  const onClick = (event: MouseEvent) => {
    const hit = findCodeCardAction(event.target);
    if (hit) runCodeCardAction(hit);
  };
  container.addEventListener("click", onClick);
  return () => container.removeEventListener("click", onClick);
}
