/**
 * Naming what a delete takes with it (docs/plans/claude-code-backlog.md §5).
 *
 * `delete b7` says nothing about what `b7` held, so a board of forty notes can
 * leave a document with nothing on screen to say it was ever there. Resolving
 * the address against the state the op was written against is the whole fix:
 * the block is still present at that point, and both halves of the sentence
 * already exist — `nodeToBlock` for what it is, the outline's own `blockPreview`
 * for what it holds ("7 notes", "3 rows × 4 columns"). Nothing here invents a
 * second vocabulary for either.
 *
 * **Not a refusal and not a confirmation.** An agent can legitimately be asked
 * to delete a canvas, and a proposal is already reviewable and declinable — the
 * safeguard was never missing, only the sentence.
 *
 * Prose is left out on purpose. A removed paragraph is legible from the diff
 * beside it, and decorating every one of them would bury the case this exists
 * for. So the phrase is often `null`, and every caller has to read that as
 * "nothing worth saying" rather than as a failure.
 */
import { locate } from "./address";
import { nodeToBlock } from "./blocks";
import { blockPreview } from "./outline";
import type { Op } from "./ops";
import type { Block, SerializedNode, StoredState } from "./types";

/** Blocks whose loss the surrounding diff already states in words. */
const PROSE: ReadonlySet<Block["type"]> = new Set([
  "paragraph",
  "heading",
  "quote",
  "summary",
  "list",
  "cell",
  "divider",
]);

/** Opaque nodes that hold nothing: naming one would be noise, not warning. */
const HOLDS_NOTHING: ReadonlySet<string> = new Set([
  "horizontalrule",
  "page-break",
  "pagebreak",
  "linebreak",
]);

/**
 * Node types whose own name is not the word for them.
 *
 * Everything absent from this map is named by its type, which is already the
 * word — canvas, table, image, sketch, graph, sticky, kanban, math, attachment.
 */
const NOUNS: Readonly<Record<string, string>> = {
  "code-snippet": "code snippet",
  details: "collapsible section",
  layout: "column layout",
  "nested-doc": "nested document",
  "layout-item": "column",
  "details-content": "section body",
  tablerow: "table row",
  "canvas-note": "note",
};

/**
 * Shorter than the outline's 80. This runs inside a rail row and a card header
 * rather than a terminal listing, and an image with no caption previews as its
 * `/api/blob/<sha256>` URL.
 */
const DETAIL_LIMIT = 40;

/** How many distinct kinds are named before the rest are counted. */
const KIND_LIMIT = 3;

const clip = (text: string): string =>
  text.length > DETAIL_LIMIT ? `${text.slice(0, DETAIL_LIMIT - 1)}…` : text;

/** Enough English for the nouns above; "canvas" is why it is not `+ "s"`. */
const plural = (noun: string): string =>
  /(s|x|ch|sh)$/.test(noun) ? `${noun}es` : `${noun}s`;

/**
 * Node types whose descriptor is already a noun phrase.
 *
 * A canvas note describes as `yellow note · 2 blocks`, which carries its own
 * noun; qualifying that with another one gives `note · yellow note · 2 blocks`.
 * Listed rather than detected, because "the detail happens to contain the noun"
 * is also true of an image whose caption says the word "image".
 */
const SELF_NAMING: ReadonlySet<string> = new Set(["canvas-note"]);

/** One removed block: the word it is counted by, and how it reads alone. */
interface Removal {
  /** `canvas`, `table`, `collapsible section` — the grouping key. */
  noun: string;
  /** `canvas · 7 notes`, `yellow note · 2 blocks`. */
  phrase: string;
}

const nounFor = (block: Block): string => {
  const type = block.type === "opaque" ? block.nodeType : block.type;
  return NOUNS[type] ?? type;
};

const worthNaming = (block: Block): boolean =>
  !PROSE.has(block.type) &&
  !(block.type === "opaque" && HOLDS_NOTHING.has(block.nodeType));

/**
 * A node as a removal, or null when it is prose or empty.
 *
 * Total, deliberately: this runs on the review rail, where a node the codecs
 * choke on must cost its own line and not the proposal. `nodeToBlock` falls
 * back to an opaque block rather than throwing, but it is walking stored JSON
 * from a document this build may not have written, so the guard stays.
 */
function removalOf(node: SerializedNode): Removal | null {
  try {
    const block = nodeToBlock(node);
    if (!worthNaming(block)) return null;
    const noun = nounFor(block);
    const detail = clip(blockPreview(block));
    const selfNaming = block.type === "opaque" &&
      SELF_NAMING.has(block.nodeType);
    return {
      noun,
      phrase: !detail
        ? noun
        : selfNaming
        ? detail
        : `${noun} · ${detail}`,
    };
  } catch {
    return null;
  }
}

/** `canvas · 7 notes`, or `""` for a block not worth naming. See the header. */
export function describeRemovedBlock(node: SerializedNode): string {
  return removalOf(node)?.phrase ?? "";
}

const listPhrase = (parts: readonly string[]): string =>
  parts.length <= 1
    ? parts[0] ?? ""
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

/**
 * One phrase for everything a batch removes, or null if that is nothing.
 *
 * `removes 1 canvas · 7 notes` for a single block — the shape detail is the
 * half that says how much is going. Past one it is dropped: `removes 2 images
 * and 1 table` stays scannable where three qualified nouns would not.
 *
 * Lower case and verb-first so it reads either as a line of its own (the
 * caller capitalizes — see {@link withRemovalNote}) or appended to one.
 */
export function describeRemovals(
  nodes: readonly SerializedNode[],
): string | null {
  const removals = nodes
    .map(removalOf)
    .filter((removal): removal is Removal => removal !== null);

  if (removals.length === 0) return null;
  if (removals.length === 1) return `removes 1 ${removals[0].phrase}`;

  const counts = new Map<string, number>();
  for (const { noun } of removals) counts.set(noun, (counts.get(noun) ?? 0) + 1);

  const named = [...counts].map(([noun, n]) =>
    `${n} ${n === 1 ? noun : plural(noun)}`
  );
  const shown = named.slice(0, KIND_LIMIT);
  const rest = named.length - shown.length;
  if (rest > 0) shown.push(`${rest} other${rest === 1 ? "" : "s"}`);

  return `removes ${listPhrase(shown)}`;
}

/**
 * The blocks a batch's `delete_block` ops name, resolved against the state
 * those addresses were written against.
 *
 * An address that resolves to nothing is skipped rather than reported: the
 * applier is what refuses a batch naming a block that is not there, and this is
 * only the sentence about it. A stale address must cost its clause, never the
 * write and never the render.
 *
 * `replace_block` is not counted. It can drop a rich block too, but the
 * replacement is on screen next to it in the review, so the change is visible
 * from the diff in a way a delete is not.
 */
export function deletedNodes(
  state: StoredState,
  ops: readonly Op[],
): SerializedNode[] {
  const nodes: SerializedNode[] = [];
  for (const op of ops) {
    if (op.op !== "delete_block") continue;
    const found = locate(state, op.id);
    if (found) nodes.push(found.node);
  }
  return nodes;
}

const capitalize = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Fold a removal phrase into a proposal's one-line summary.
 *
 * `undefined` in and `undefined` out is load-bearing: on a squash that means
 * "keep whatever the row already says" (`foldProposal`), and turning it into a
 * string would silently replace an earlier batch's line. So the note only ever
 * *appears*, never blanks anything.
 */
export function withRemovalNote(
  summary: string | null | undefined,
  note: string | null,
): string | null | undefined {
  if (!note) return summary;
  return summary ? `${summary} — ${note}` : capitalize(note);
}
