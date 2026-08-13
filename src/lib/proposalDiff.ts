/**
 * Per-hunk diff between a document and a pending agent proposal
 * (docs/plans/archive/haklex-adoption.md §7, docs/plans/archive/agent-gating.md §3.5's third
 * tier — "accept some ops, reject the rest").
 *
 * ### Why this is a diff over two states, not a replay of ops
 *
 * Haklex's review surface computes anchors (`anchorBeforeId` /
 * `anchorAfterId`) because their review state is *ops that have not been
 * applied yet*: nothing knows where an insert lands until it lands. Ours is
 * **materialized** — a proposal is a `Revision` row whose `data` already has
 * every insert in place and every touched node id-stamped by `applyOps`. So
 * document order in the proposal *is* the position, and there is no anchor
 * arithmetic to get wrong. §3.3 stores the ops as well, but they are not what
 * this module reads.
 *
 * ### The property everything here rests on
 *
 * `applyOps` copies every subtree no op named, verbatim — the central claim of
 * `content-bridge/__tests__/ops.test.ts`. An untouched block therefore
 * serializes identically on both sides, so **deep equality per block is an
 * exact changed-detector**, not an approximation. That is what lets this be a
 * structural walk rather than a text diff, and it is why a 200-block document
 * with one edited paragraph yields exactly one hunk.
 *
 * ### Determinism is load-bearing
 *
 * The client sends back the ids of the hunks the author rejected, and the
 * server recomputes the diff from the same two rows to decide what those ids
 * meant. A hunk id is therefore a pure function of `(base, proposal)`: it is
 * built from the block's persistent id and its structural address, both read
 * off the two states, with no clock, no counter, no randomness and no
 * dependence on hash-map iteration order. Recomputing the diff on any machine,
 * in any process, gives byte-identical ids in the same order.
 *
 * ### On imports
 *
 * `proposals.ts` and `dragGeometry.ts` are import-free so they can be
 * exercised without a database or a browser, and this module keeps that
 * property — it touches no Prisma, no React and no DOM. What it does import is
 * the content bridge's *addressing* primitives, deliberately: a second
 * traversal that disagreed with `walkBlocks` about what `b4.2` names, or with
 * `BLOCK_CONTAINERS` about which nodes have addressable children, would put
 * the review UI and the agent's ops in different coordinate systems.
 */
import { BLOCK_CONTAINERS, formatAddress } from "@/lib/content-bridge/address";
import { readBlockId } from "@/lib/content-bridge/blockId";
import type {
  Address,
  SerializedNode,
  StoredState,
} from "@/lib/content-bridge/types";

// ─── The unit of review ──────────────────────────────────────────────────────

export type HunkKind = "replace" | "insert" | "delete";

/**
 * One reviewable change.
 *
 * Both sides are carried whole, because the proposal is materialized: a
 * renderer showing "was / now" needs no lookup and no second state to resolve
 * against.
 */
export interface Hunk {
  /** Stable across a client/server recompute — see the header. */
  id: string;
  kind: HunkKind;
  /**
   * The block's persistent id, or `""` when neither side is stamped. On a
   * `replace` the base side wins, so the id names the block that already
   * existed rather than whatever `applyOps` minted for its replacement.
   */
  blockId: string;
  /** Structural address in the base state — `replace` and `delete` only. */
  baseAddress: Address | null;
  /** Structural address in the proposal state — `replace` and `insert` only. */
  proposalAddress: Address | null;
  /** Nesting level: 0 for a top-level block, 2 for a cell inside a table. */
  depth: number;
  /** The block as it stands today. Null for an `insert`. */
  base: SerializedNode | null;
  /** The block as proposed. Null for a `delete`. */
  proposal: SerializedNode | null;
}

/**
 * A hunk id the current diff does not contain.
 *
 * Raised rather than ignored: the server validates the client's selection with
 * this, and silently dropping an id it does not recognise would apply a
 * decision set the author never made — with a 200 and no way to tell.
 */
export class UnknownHunkError extends Error {
  constructor(readonly ids: readonly string[]) {
    super(
      `unknown hunk ${ids.length === 1 ? "id" : "ids"}: ${ids.join(", ")}`,
    );
    this.name = "UnknownHunkError";
  }
}

// ─── Structural helpers ──────────────────────────────────────────────────────

/**
 * A node's children, without giving it any.
 *
 * Same rule as `ops.ts`: materializing an absent `children` array on a leaf
 * would make it stop serializing identically, which is the one property both
 * modules exist to hold.
 */
const childrenOf = (node: SerializedNode): SerializedNode[] =>
  Array.isArray(node.children) ? (node.children as SerializedNode[]) : [];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Structural equality over stored JSON.
 *
 * Deliberately not `JSON.stringify` equality, which also compares *key order*.
 * A state that has been through a node class can come back with its keys in a
 * different order while being the same document, and reporting that as an edit
 * would fill the review surface with hunks nobody made.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(right, key) &&
      deepEqual(left[key], right[key]),
  );
}

/** Everything except `children` — what decides container recursion. */
function ownPropsEqual(a: SerializedNode, b: SerializedNode): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.delete("children");
  for (const key of keys) if (!deepEqual(a[key], b[key])) return false;
  return true;
}

/**
 * May a changed pair be reviewed child by child rather than as one block?
 *
 * Only for the containers `BLOCK_CONTAINERS` already addresses through, and
 * only when the container's *own* fields are untouched. A table whose width
 * changed as well as one of its cells is a single hunk, because accepting the
 * cell while rejecting the width is not a state either side proposed — the
 * conservative answer is the whole block.
 *
 * This is what makes a one-cell table edit a cell hunk: `blog-table` and
 * `tablerow` recurse, `blog-tablecell` is a leaf (see `address.ts`).
 */
const canRecurse = (base: SerializedNode, proposal: SerializedNode): boolean =>
  base.type === proposal.type &&
  BLOCK_CONTAINERS.has(base.type) &&
  ownPropsEqual(base, proposal);

// ─── Alignment ───────────────────────────────────────────────────────────────

/** One slot of the alignment: a pair, a base-only delete, or a proposal-only insert. */
interface Pairing {
  base: number | null;
  proposal: number | null;
}

/**
 * The tiers a pair of child lists is matched on, most trustworthy first.
 *
 * 1. **Persistent id.** `applyOps` stamps every node it touches, so an edited
 *    block carries an id on at least the proposal side, and a block that was
 *    already stamped keeps it through a same-type rewrite (the §4.6.1
 *    carry-through in `blocks.ts` spreads the previous node, `$` included).
 * 2. **Exact content.** Unstamped blocks nobody touched are byte-identical,
 *    which pins the unchanged skeleton around a change.
 * 3. **Node type.** What pairs an unstamped paragraph with its edited self
 *    when the two above cannot see it.
 *
 * A `null` key never matches, so an unstamped block simply falls through tier 1
 * rather than colliding with every other unstamped block.
 */
const KEY_TIERS: ReadonlyArray<(node: SerializedNode) => string | null> = [
  (node) => readBlockId(node) || null,
  (node) => JSON.stringify(node),
  (node) => node.type,
];

/**
 * Longest common subsequence, as index pairs.
 *
 * Ties break towards advancing the base side, which is arbitrary but fixed —
 * the id contract needs one answer, not the best one.
 */
function lcsPairs(
  a: readonly (string | null)[],
  b: readonly (string | null)[],
): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from(
    { length: n + 1 },
    () => new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[i] !== null && a[i] === b[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] !== null && a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

/**
 * The last resort: pair what is left positionally.
 *
 * Reached only inside a gap that three tiers of matching could not resolve, so
 * the two lists are already known to be siblings between the same anchors.
 * Pairing them means a rewrite that also changed the block's *type* — the one
 * case where `applyOps` mints a fresh id instead of carrying one through —
 * reads as one "was / now" hunk rather than as an unrelated delete beside an
 * unrelated insert.
 *
 * **This is where ambiguity lands.** With two candidates and no id, no
 * identical content and no matching type, position is the only remaining
 * signal, and it can be wrong: an insert *before* an edited unstamped block
 * pairs the base block with the inserted one. The result is still a faithful
 * partial-accept — reject everything and the base comes back, reject nothing
 * and the proposal does — it is only the attribution in the middle that is a
 * guess. Every path an agent takes stamps ids, so this is reachable mainly
 * through hand-built states.
 */
function zip(
  baseIdx: readonly number[],
  proposalIdx: readonly number[],
): Pairing[] {
  const out: Pairing[] = [];
  const shared = Math.min(baseIdx.length, proposalIdx.length);
  for (let k = 0; k < shared; k++) {
    out.push({ base: baseIdx[k], proposal: proposalIdx[k] });
  }
  for (let k = shared; k < baseIdx.length; k++) {
    out.push({ base: baseIdx[k], proposal: null });
  }
  for (let k = shared; k < proposalIdx.length; k++) {
    out.push({ base: null, proposal: proposalIdx[k] });
  }
  return out;
}

/**
 * Align two child lists, monotonically and exhaustively.
 *
 * Each tier's matches become anchors; the gaps between them are handed to the
 * next tier. Restricting every tier to an LCS is what keeps the alignment
 * monotone, which is what makes a *move* read as a delete plus an insert
 * rather than as a crossing pair the materializer could not honour.
 */
function alignRange(
  baseNodes: readonly SerializedNode[],
  proposalNodes: readonly SerializedNode[],
  baseIdx: readonly number[],
  proposalIdx: readonly number[],
  tier: number,
): Pairing[] {
  if (
    tier >= KEY_TIERS.length ||
    baseIdx.length === 0 ||
    proposalIdx.length === 0
  ) {
    return zip(baseIdx, proposalIdx);
  }

  const key = KEY_TIERS[tier];
  const anchors = lcsPairs(
    baseIdx.map((i) => key(baseNodes[i])),
    proposalIdx.map((j) => key(proposalNodes[j])),
  );

  const out: Pairing[] = [];
  let from = 0;
  let to = 0;
  const gap = (endBase: number, endProposal: number) => {
    out.push(
      ...alignRange(
        baseNodes,
        proposalNodes,
        baseIdx.slice(from, endBase),
        proposalIdx.slice(to, endProposal),
        tier + 1,
      ),
    );
  };

  for (const [i, j] of anchors) {
    gap(i, j);
    out.push({ base: baseIdx[i], proposal: proposalIdx[j] });
    from = i + 1;
    to = j + 1;
  }
  gap(baseIdx.length, proposalIdx.length);
  return out;
}

const align = (
  baseNodes: readonly SerializedNode[],
  proposalNodes: readonly SerializedNode[],
): Pairing[] =>
  alignRange(
    baseNodes,
    proposalNodes,
    baseNodes.map((_, i) => i),
    proposalNodes.map((_, i) => i),
    0,
  );

// ─── The single traversal ────────────────────────────────────────────────────

interface Pass {
  hunks: Hunk[];
  ids: Set<string>;
  /** Which hunks the author refused. Empty for a plain diff. */
  rejected: ReadonlySet<string>;
}

/**
 * Diffing and materializing are **one walk**, run with different decisions.
 *
 * Two implementations would be two chances to disagree about what a hunk id
 * names, and the disagreement would surface as the server applying a decision
 * to the wrong block. The alignment does not read `rejected`, so the hunk set
 * is identical whatever the author chose.
 */
function record(pass: Pass, hunk: Omit<Hunk, "id">): Hunk {
  const address = hunk.kind === "insert"
    ? hunk.proposalAddress
    : hunk.baseAddress;
  // Both halves are needed. The id alone is absent on an unstamped block, and
  // the address alone repeats across kinds — a block replaced at `b3` and a
  // different block deleted at `b3` are distinct hunks. Addresses are unique
  // within a state, and the two path-bearing kinds read from opposite states,
  // so the kind prefix is what keeps them apart.
  const full: Hunk = {
    ...hunk,
    id: `${hunk.kind}:${hunk.blockId || "-"}|${address ?? ""}`,
  };
  pass.hunks.push(full);
  pass.ids.add(full.id);
  return full;
}

/**
 * Rebuild a container around merged children, preferring a verbatim side.
 *
 * The two identity checks are not an optimisation. "Reject every hunk and you
 * get the base back" has to be true of the *stored JSON*, not merely of a deep
 * comparison — an author who rejects everything must not have their document
 * rewritten with the proposal's key ordering and a new `stateHash`.
 */
function rebuild(
  base: SerializedNode,
  proposal: SerializedNode,
  merged: readonly SerializedNode[],
): SerializedNode {
  const same = (kids: readonly SerializedNode[]) =>
    kids.length === merged.length && merged.every((node, i) => node === kids[i]);
  if (same(childrenOf(base))) return base;
  if (same(childrenOf(proposal))) return proposal;
  return { ...proposal, children: [...merged] };
}

function mergeChildren(
  baseKids: readonly SerializedNode[],
  proposalKids: readonly SerializedNode[],
  basePath: readonly number[],
  proposalPath: readonly number[],
  depth: number,
  pass: Pass,
): SerializedNode[] {
  const out: SerializedNode[] = [];

  for (const pair of align(baseKids, proposalKids)) {
    if (pair.base !== null && pair.proposal !== null) {
      const base = baseKids[pair.base];
      const proposal = proposalKids[pair.proposal];
      // The byte-identical guarantee, cashed in: an untouched subtree is one
      // comparison and no hunk, however large it is.
      if (deepEqual(base, proposal)) {
        out.push(proposal);
        continue;
      }

      const nextBase = [...basePath, pair.base];
      const nextProposal = [...proposalPath, pair.proposal];

      if (canRecurse(base, proposal)) {
        out.push(rebuild(
          base,
          proposal,
          mergeChildren(
            childrenOf(base),
            childrenOf(proposal),
            nextBase,
            nextProposal,
            depth + 1,
            pass,
          ),
        ));
        continue;
      }

      const hunk = record(pass, {
        kind: "replace",
        blockId: readBlockId(base) || readBlockId(proposal),
        baseAddress: formatAddress(nextBase),
        proposalAddress: formatAddress(nextProposal),
        depth,
        base,
        proposal,
      });
      // Verbatim on refusal, base-side `$` included: an agent's next read must
      // not meet an id that never existed in any stored revision.
      out.push(pass.rejected.has(hunk.id) ? base : proposal);
      continue;
    }

    if (pair.proposal !== null) {
      const proposal = proposalKids[pair.proposal];
      const nextProposal = [...proposalPath, pair.proposal];
      const hunk = record(pass, {
        kind: "insert",
        blockId: readBlockId(proposal),
        baseAddress: null,
        proposalAddress: formatAddress(nextProposal),
        depth,
        base: null,
        proposal,
      });
      if (!pass.rejected.has(hunk.id)) out.push(proposal);
      continue;
    }

    if (pair.base !== null) {
      const base = baseKids[pair.base];
      const nextBase = [...basePath, pair.base];
      const hunk = record(pass, {
        kind: "delete",
        blockId: readBlockId(base),
        baseAddress: formatAddress(nextBase),
        proposalAddress: null,
        depth,
        base,
        proposal: null,
      });
      // Refusing a delete puts the block back where the alignment says it sat
      // among its surviving siblings, which is its base position.
      if (pass.rejected.has(hunk.id)) out.push(base);
    }
  }

  return out;
}

function walk(
  base: StoredState,
  proposal: StoredState,
  rejected: ReadonlySet<string>,
): { pass: Pass; state: StoredState } {
  const pass: Pass = { hunks: [], ids: new Set(), rejected };
  const merged = mergeChildren(
    childrenOf(base.root),
    childrenOf(proposal.root),
    [],
    [],
    0,
    pass,
  );
  const root = rebuild(base.root, proposal.root, merged);
  const state = root === base.root
    ? base
    : root === proposal.root
    ? proposal
    : { ...proposal, root };
  return { pass, state };
}

// ─── Public surface ──────────────────────────────────────────────────────────

/**
 * Every reviewable difference between the document and the proposal, in
 * document order, parents before children.
 *
 * Both arguments are stored editor states — `Revision.data`'s shape. A
 * proposal against a document with no head yet diffs against `emptyState()`
 * (`content-bridge/ops.ts`), which reads as one insert per block.
 */
export function diffProposal(
  base: StoredState,
  proposal: StoredState,
): Hunk[] {
  return walk(base, proposal, new Set<string>()).pass.hunks;
}

/**
 * The proposal with the named hunks refused — the partial-accept materializer.
 *
 * The result is a fresh state sharing nothing with either input, so approving
 * it cannot alias rows that are still in play.
 *
 * @throws {UnknownHunkError} if an id is not one this diff produces. The
 * caller is a route validating client input against a recomputed diff, and an
 * id it does not recognise means the two computed different diffs — which is
 * a 400, never a silent accept-everything.
 */
export function applyDecisions(
  base: StoredState,
  proposal: StoredState,
  rejectedHunkIds: readonly string[],
): StoredState {
  const rejected = new Set(rejectedHunkIds);
  const { pass, state } = walk(base, proposal, rejected);

  const unknown = [...rejected].filter((id) => !pass.ids.has(id)).sort();
  if (unknown.length > 0) throw new UnknownHunkError(unknown);

  return clone(state);
}
