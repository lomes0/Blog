/**
 * The shape a per-hunk review renders, and the decisions it collects
 * (docs/plans/archive/haklex-adoption.md §7).
 *
 * `proposalDiff.ts` answers *what changed*; this answers *what to draw and in
 * what order*, which is a different question and the one the surface actually
 * asks. A hunk list is not a document: it says a block at `b7` was replaced and
 * says nothing about the six blocks before it, so a component reading hunks
 * alone can only render a list of changes floating free of the prose they are
 * changes to. Reviewing an edit without its surroundings is how you approve a
 * paragraph that now repeats the one above it.
 *
 * ### Why the pairing has to be reconstructed rather than passed through
 *
 * `diffProposal` aligns the two child lists internally and then throws the
 * alignment away, because nothing server-side needs it — `applyDecisions` walks
 * the same alignment a second time rather than storing it. Rebuilding it here
 * from the hunks is exact, not a guess, and it rests on three properties the
 * diff already guarantees:
 *
 *   1. Every base index is either **deleted** or **paired**; every proposal
 *      index is either **inserted** or **paired**. There is no third outcome.
 *   2. A hunk carrying both addresses names a pair outright — at depth 0 the
 *      pair *is* the hunk, and deeper the two addresses share a top-level
 *      index, so a changed table cell names its table's pairing.
 *   3. The alignment is **monotone**. So once the pairs named by hunks are
 *      removed, the base indices left over pair with the proposal indices left
 *      over *in order* — which recovers both the untouched blocks and any
 *      container whose only nested hunks were one-sided.
 *
 * Property 3 is what makes this a reconstruction instead of a heuristic. Drop
 * monotonicity from `proposalDiff` and this module silently starts lying.
 *
 * ### On imports
 *
 * Import-free of React, the DOM and Prisma, for the reason every phase of this
 * work has been: the suite runs in `environment: "node"` and mounts nothing, so
 * logic that lives in a component is logic with no spec. What it does import is
 * the diff's own addressing, deliberately — a second reading of what `b4.2`
 * means would put the renderer and the decision in different coordinate
 * systems.
 */
import { parseAddress } from "@/lib/content-bridge/address";
import type { SerializedNode, StoredState } from "@/lib/content-bridge/types";
import type { Hunk } from "@/lib/proposalDiff";

// ─── What the surface draws ──────────────────────────────────────────────────

/**
 * One card in the review, in document order.
 *
 * A `context` row is a **run** of consecutive untouched blocks rather than one
 * row per block: a 200-block document with one edit is then three rows, not
 * 200, and the run renders through a single headless parse instead of 199.
 */
export type ReviewRow =
  | {
    kind: "context";
    key: string;
    /** Untouched blocks, taken from the proposal side — the two are equal. */
    nodes: SerializedNode[];
  }
  | {
    kind: "change";
    key: string;
    hunk: Hunk;
    /**
     * The node type of the top-level block this hunk sits *inside*, when it is
     * nested — `blog-table` for a changed cell. Null for a top-level hunk.
     *
     * Carried because a lone `<td>`'s worth of content is unreadable without
     * saying what it came out of, and the address alone (`b4.1.2`) is not a
     * thing an author recognises.
     */
    container: string | null;
  };

const childrenOf = (node: SerializedNode): SerializedNode[] =>
  Array.isArray(node.children) ? (node.children as SerializedNode[]) : [];

/** The top-level index an address falls under, or null. */
const topOf = (address: string | null): number | null => {
  if (!address) return null;
  const path = parseAddress(address);
  return path && path.length > 0 ? path[0] : null;
};

const push = <K, V>(map: Map<K, V[]>, key: K, value: V): void => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

interface Slot {
  base: number | null;
  proposal: number | null;
}

/**
 * Recover the top-level alignment from the hunks — see the header for why this
 * is exact.
 */
function alignTopLevel(
  baseCount: number,
  proposalCount: number,
  hunks: readonly Hunk[],
): Slot[] {
  const baseOfProposal = new Map<number, number>();
  const pairedBase = new Set<number>();
  const deleted = new Set<number>();
  const inserted = new Set<number>();

  for (const hunk of hunks) {
    const base = topOf(hunk.baseAddress);
    const proposal = topOf(hunk.proposalAddress);
    if (base !== null && proposal !== null) {
      baseOfProposal.set(proposal, base);
      pairedBase.add(base);
    } else if (base !== null && hunk.depth === 0) {
      // Only a *top-level* one-sided hunk is a top-level delete. A deleted
      // table row carries a base address and no proposal one too, and its
      // table is very much still paired.
      deleted.add(base);
    } else if (proposal !== null && hunk.depth === 0) {
      inserted.add(proposal);
    }
  }

  // Property 3, cashed in: whatever the hunks did not account for pairs in
  // order. This recovers untouched blocks *and* containers whose nested hunks
  // were all one-sided (a table that only gained a row).
  const freeBase: number[] = [];
  for (let i = 0; i < baseCount; i++) {
    if (!deleted.has(i) && !pairedBase.has(i)) freeBase.push(i);
  }
  const freeProposal: number[] = [];
  for (let j = 0; j < proposalCount; j++) {
    if (!inserted.has(j) && !baseOfProposal.has(j)) freeProposal.push(j);
  }
  // Equal by construction. Zipping the shorter rather than asserting keeps a
  // disagreement a rendering imperfection instead of a blank screen — the
  // decision the author makes is the hunk set, and that is unaffected.
  const zipped = Math.min(freeBase.length, freeProposal.length);
  for (let k = 0; k < zipped; k++) {
    baseOfProposal.set(freeProposal[k], freeBase[k]);
  }
  for (let k = zipped; k < freeBase.length; k++) deleted.add(freeBase[k]);

  const slots: Slot[] = [];
  let nextBase = 0;
  const drainDeletes = (until: number) => {
    while (nextBase < until) {
      if (deleted.has(nextBase)) slots.push({ base: nextBase, proposal: null });
      nextBase++;
    }
  };

  for (let j = 0; j < proposalCount; j++) {
    const base = baseOfProposal.get(j);
    if (base === undefined) {
      slots.push({ base: null, proposal: j });
      continue;
    }
    drainDeletes(base);
    slots.push({ base, proposal: j });
    nextBase = base + 1;
  }
  drainDeletes(baseCount);

  return slots;
}

/**
 * The document as a review: untouched runs and changed blocks, in order.
 *
 * Hunks keep the order `diffProposal` produced them in, so two clients — or a
 * client and a re-render — draw the same list. Nothing here reads the author's
 * decisions: what is on screen must not move when a toggle is flipped, or
 * refusing one hunk would reshuffle the ones around it.
 */
export function buildReviewRows(
  base: StoredState,
  proposal: StoredState,
  hunks: readonly Hunk[],
): ReviewRow[] {
  const baseKids = childrenOf(base.root);
  const proposalKids = childrenOf(proposal.root);

  const byBase = new Map<number, Hunk[]>();
  const byProposal = new Map<number, Hunk[]>();
  for (const hunk of hunks) {
    const top = topOf(hunk.baseAddress);
    if (top !== null) push(byBase, top, hunk);
    const proposalTop = topOf(hunk.proposalAddress);
    if (proposalTop !== null) push(byProposal, proposalTop, hunk);
  }

  const rows: ReviewRow[] = [];
  let run: SerializedNode[] = [];
  let runStart = 0;

  const flush = () => {
    if (run.length === 0) return;
    rows.push({ kind: "context", key: `context:${runStart}`, nodes: run });
    run = [];
  };

  for (const slot of alignTopLevel(baseKids.length, proposalKids.length, hunks)) {
    // A pair's hunks can be named from either side; a nested delete only from
    // the base side and a nested insert only from the proposal side, so both
    // maps are consulted and the union is taken in `hunks` order.
    const here = new Set<Hunk>();
    if (slot.base !== null) {
      for (const hunk of byBase.get(slot.base) ?? []) here.add(hunk);
    }
    if (slot.proposal !== null) {
      for (const hunk of byProposal.get(slot.proposal) ?? []) here.add(hunk);
    }

    if (here.size === 0) {
      // Untouched. Either side would do; the proposal side is what the
      // approved document will hold.
      const node = slot.proposal !== null
        ? proposalKids[slot.proposal]
        : slot.base !== null
        ? baseKids[slot.base]
        : undefined;
      if (node) {
        if (run.length === 0) {
          runStart = slot.proposal ?? slot.base ?? 0;
        }
        run.push(node);
      }
      continue;
    }

    flush();
    const container = slot.base !== null && slot.proposal !== null
      ? baseKids[slot.base]?.type ?? null
      : null;
    for (const hunk of hunks) {
      if (!here.has(hunk)) continue;
      rows.push({
        kind: "change",
        key: hunk.id,
        hunk,
        // A top-level hunk *is* the block, so naming its own type as the
        // container it sits in would be a lie the label repeats.
        container: hunk.depth === 0 ? null : container,
      });
    }
  }

  flush();
  return rows;
}

// ─── Rendering one block on its own ──────────────────────────────────────────

/**
 * A single block as a whole editor state, so it can be rendered by itself.
 *
 * **Ancestors are rebuilt, not stripped.** A `blog-tablecell` handed to the
 * root alone exports as a bare `<td>`, which is neither valid nor legible; a
 * `layout-item` loses the grid that gives its width meaning. Wrapping the node
 * back through its own ancestors — with every sibling dropped — renders a
 * changed cell as a one-cell table, which is what it is.
 *
 * The root is spread rather than invented so a document's own root-level
 * direction and format survive the isolation.
 *
 * @param state the state the address is valid against — the *base* for a
 * `delete`'s address, the *proposal* for an `insert`'s.
 */
export function isolateBlock(
  state: StoredState,
  address: string | null,
  node: SerializedNode,
): StoredState | null {
  const path = address ? parseAddress(address) : null;
  if (!path || path.length === 0) return null;

  const ancestors: SerializedNode[] = [];
  let cursor: SerializedNode = state.root;
  for (let depth = 0; depth < path.length - 1; depth++) {
    const next = childrenOf(cursor)[path[depth]];
    if (!next) return null;
    ancestors.push(next);
    cursor = next;
  }

  let wrapped = node;
  for (let depth = ancestors.length - 1; depth >= 0; depth--) {
    wrapped = { ...ancestors[depth], children: [wrapped] };
  }
  return { ...state, root: { ...state.root, children: [wrapped] } };
}

/** A run of top-level blocks as a state of their own — the context rows. */
export const isolateBlocks = (
  state: StoredState,
  nodes: readonly SerializedNode[],
): StoredState => ({
  ...state,
  root: { ...state.root, children: [...nodes] },
});

// ─── Decisions ───────────────────────────────────────────────────────────────

/** Accept what was refused, or refuse what was accepted. */
export function toggleRejection(
  rejected: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(rejected);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** Refuse everything — the counterpart of an empty set. */
export const rejectAllHunks = (hunks: readonly Hunk[]): Set<string> =>
  new Set(hunks.map((hunk) => hunk.id));

/**
 * The selection to send, in diff order and **filtered to hunks that still
 * exist**.
 *
 * The filter matters after a re-fetch: an id the current diff does not contain
 * is a 400 (`unknown-hunks`) by design, which is right when the client believes
 * it is naming something real and wrong when it is only carrying a decision
 * about a hunk that has since gone. Dropping it here means the refusal the
 * server makes is always about a genuine disagreement.
 */
export const rejectedHunkIds = (
  hunks: readonly Hunk[],
  rejected: ReadonlySet<string>,
): string[] => hunks.filter((hunk) => rejected.has(hunk.id)).map((h) => h.id);

export interface DecisionCounts {
  total: number;
  accepted: number;
  refused: number;
}

/** What the bar says, counted over the current hunk set rather than the set. */
export const decisionCounts = (
  hunks: readonly Hunk[],
  rejected: ReadonlySet<string>,
): DecisionCounts => {
  const refused = rejectedHunkIds(hunks, rejected).length;
  return { total: hunks.length, accepted: hunks.length - refused, refused };
};
