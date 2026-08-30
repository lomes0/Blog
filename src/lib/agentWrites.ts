/**
 * The one path an agent's content write takes into storage.
 *
 * Two agents write this blog's documents — Claude Code over stdio
 * (`mcp/content-server.ts`) and the in-app Copilot over HTTP — and until now
 * only the first of them went through the proposal machinery
 * (docs/plans/archive/agent-gating.md). The second dispatched `updatePost` from the
 * browser on an accept, so it had no compare-and-set, no staleness, no
 * provenance, no squash and no review surface: "the AI edited my post" meant
 * two different things depending on which AI (docs/plans/
 * ai-surface-consolidation.md §2.4). This module is §4.4.1 — *one write
 * function, not one write table*. `mcp/content-server.ts`'s `apply_ops` and
 * `create_post` handlers are now calls to it, and
 * `POST /api/documents/[id]/proposals` is the same call with an HTTP door in
 * front.
 *
 * The point is not deduplication. It is that there is exactly **one** execution
 * of `applyOps` against **one** authoritative base — the state
 * `selectAgentRead` picks, read here, on the server — rather than two
 * implementations that happen to write the same columns and a client computing
 * a document state the server would then have to trust.
 *
 * ## Where this sits
 *
 * `src/lib/` rather than `src/repositories/`, because it composes the content
 * bridge with two repositories (`revision`, `ordering`) and the repositories
 * stay row-level: `upsertProposal` knows how to fold a batch into a row, and
 * knows nothing about Lexical states, block addresses or `stateHash`.
 *
 * ## Server-only
 *
 * This imports Prisma. It must never become reachable from the browser bundle —
 * do not re-export it from a barrel the client imports, for the same reason
 * `content-bridge/schema.ts` is deliberately kept out of `content-bridge/index`.
 * Callers are route handlers and the MCP process, both of which are already
 * server-side.
 *
 * ## What it does not do
 *
 * **It does not authorize.** `ownedBy` is a lookup filter for the one caller
 * whose entire authorization *is* that filter (the MCP server, single-user by
 * `MCP_AUTHOR_ID`); every other caller must have gone through
 * `requireDocument` in `src/lib/access.ts` before it gets here. Nothing below
 * checks who the caller is.
 */
import { randomUUID } from "node:crypto";
import { DocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { changeNotification } from "@/lib/changes/notify";
import { isProposalStale, selectAgentRead } from "@/lib/proposals";
import { addToOrder, containerOf, rankForAppend } from "@/repositories/ordering";
import { reconcileDocumentBlobs } from "@/repositories/blob";
import { blobHashesFor } from "@/lib/blobRefs";
import {
  findPendingProposal,
  type ProposalRecord,
  upsertProposal,
} from "@/repositories/revision";
import {
  applyOps,
  type ApplyResult,
  deletedNodes,
  describeRemovals,
  emptyState,
  type Op,
  OpError,
  type OpErrorCode,
  StaleStateError,
  stateFromBlocks,
  stateHash,
  type StoredState,
  withRemovalNote,
  type WritableBlock,
} from "@/lib/content-bridge";

// ─── Reading the state an agent addresses ────────────────────────────────────

/** The document state a write is built on, and the base it will record. */
export interface AgentReadState {
  id: string;
  name: string;
  /** The document's owner — *not* necessarily whoever is writing. */
  ownerId: string;
  state: StoredState;
  /**
   * `Document.head` as it was when this state was read — the **base** a
   * proposal records, not a precondition anything checks here.
   *
   * It used to be both: `saveRevision` moved `head` conditionally on it, and a
   * miss meant an editor tab had saved underneath. Gating removed that write, so
   * nothing here guards anything any more. The value's one job now is to be
   * stored as `baseRevisionId` when the proposal is *created*, where it becomes
   * `expectedHead` for approval's compare-and-set (agent-gating §3.4) — which is
   * why it is head rather than whatever row `state` was actually read from. Once
   * a proposal exists those two differ, and a squash ignores this field entirely
   * (§3.2).
   */
  base: string | null;
  /**
   * Which state was read: the committed document, or the document's pending
   * proposal. Every read surface says so, because "the outline you are looking
   * at is not what the blog is serving" is a fact the agent has to carry into
   * what it tells the user.
   */
  source: "proposal" | "committed" | "empty";
  /**
   * True when this document has a pending proposal that was skipped because it
   * went stale — the author saved after it was written, so it can no longer be
   * approved (§3.6). What follows is the live document, and the next write
   * replaces that proposal rather than folding into it.
   */
  staleProposal: boolean;
}

/**
 * Fetch a document as an editor state, the way an agent must see it.
 *
 * **The pending proposal wins over `head`.** If a batch rewrote block 2, the
 * next `outline` has to show that rewrite, or its addresses describe a document
 * that no longer exists and the fold silently drops the earlier batch (§3.2).
 * `selectAgentRead` makes that choice, and keeps it apart from the `base` a
 * write records.
 *
 * **Unless the proposal has gone stale**, in which case the document wins —
 * see below, and §3.6.
 *
 * @param documentId A real `Document.id`, never a handle. Routes resolve the
 *                   handle first (`requireDocument`) and pass the id they got
 *                   back, because proposals are keyed by `documentId`.
 * @param options    `ownedBy` restricts the lookup to that author's own
 *                   documents. See the module comment: it is authorization only
 *                   for the caller that has no other kind.
 */
export async function readAgentState(
  documentId: string,
  options: { ownedBy?: string } = {},
): Promise<AgentReadState | null> {
  const doc = await prisma.document.findFirst({
    where: {
      id: documentId,
      ...(options.ownedBy ? { authorId: options.ownedBy } : {}),
      // Only regular documents. The enum has one member today, so this filter
      // costs nothing and states the intent for the day it does not.
      type: DocumentType.DOCUMENT,
    },
    select: { id: true, name: true, head: true, authorId: true },
  });
  if (!doc) return null;

  const pending = await findPendingProposal(doc.id);

  // A *stale* proposal loses to the document (§3.6): the author has saved since
  // it was written, so its content is built on a base that is no longer head and
  // approval will refuse it. Reading it anyway would produce a second batch
  // addressing blocks the author has already moved past, equally unapprovable —
  // the "ask Claude again against current content" of §3.6 has to start with the
  // agent reading the current content. `selectAgentRead` makes the same call
  // from the same function; this one only decides whether the committed state is
  // worth fetching, since it is the whole document state.
  const usePending = !!pending && !isProposalStale(pending, doc.head);

  // Only looked up when there is no proposal to read instead. Both arms filter
  // `proposedAt: null`: the no-head fallback in particular used to be a bare
  // "newest revision", and under gating the newest revision is usually the
  // proposal — which would make this branch resolve it by accident, in the one
  // case where the accident is indistinguishable from the decision until it is
  // wrong.
  const committed = usePending
    ? null
    : doc.head
    ? await prisma.revision.findFirst({
      where: { id: doc.head, proposedAt: null },
      select: { id: true, data: true },
    })
    : await prisma.revision.findFirst({
      where: { documentId: doc.id, proposedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, data: true },
    });

  const read = selectAgentRead({ head: doc.head, pending, committed });

  // A document with no revision yet is an empty document, not an error — it can
  // be written to like any other.
  const data = read.revision?.data;
  return {
    id: doc.id,
    name: doc.name,
    ownerId: doc.authorId,
    state: (data as StoredState | undefined) ?? emptyState(),
    base: read.base,
    source: read.source,
    staleProposal: read.staleProposal,
  };
}

// ─── Proposing an edit ───────────────────────────────────────────────────────

export interface ProposeOpsInput {
  /** A real `Document.id` — see {@link readAgentState}. */
  documentId: string;
  /** Whoever the agent authenticated as; recorded as the revision's author. */
  authorId: string;
  ops: readonly Op[];
  /** The `stateHash` from the read these block addresses came from. */
  stateHash: string;
  /** `Revision.origin` — the agent's own name, e.g. `claude-code`. */
  origin: string;
  /** One line for the review rail. Omitted keeps whatever is stored (§3.2). */
  summary?: string | null;
  /** Lookup filter, not an authorization. See the module comment. */
  ownedBy?: string;
}

/**
 * Why a write was refused. Three answers rather than one string, because the
 * callers have to tell them apart: a missing document is a 404, a moved state is
 * a 409 the agent recovers from by re-reading, and a malformed op is a 400 that
 * retrying will not fix.
 *
 * `code` is the exception inside that last one. `"block_not_found"` is an
 * `invalid` by status and a `stale` by recovery — the ops were well-formed and
 * the address was simply out of date — so it carries a name the surfaces can
 * put in front of the message, rather than being told apart by matching prose.
 * Absent means the plain reading holds: retrying unchanged fails identically.
 */
export type AgentWriteRefusal =
  | { ok: false; reason: "not-found"; message: string }
  | { ok: false; reason: "stale"; message: string }
  | { ok: false; reason: "invalid"; message: string; code?: OpErrorCode };

export interface ProposeOpsSuccess {
  ok: true;
  document: { id: string; name: string };
  /** The pending row, `replaced` included — see `ProposalRecord`. */
  proposal: ProposalRecord;
  /**
   * What happened to the document's single pending row, so a caller can say
   * which: a first batch `created` it, a later one `squashed` into it, and a
   * batch that found a stale row `replaced` it outright (§3.6) — the last being
   * the one the user has to hear about, since their earlier proposal is gone.
   */
  outcome: "created" | "squashed" | "replaced";
  /** How many blocks the batch touched. */
  changed: number;
  /** The proposed state, for a caller that wants to render or outline it. */
  state: StoredState;
  /** Its hash: the token the *next* batch must carry back. */
  stateHash: string;
}

export type ProposeOpsResult = ProposeOpsSuccess | AgentWriteRefusal;

/**
 * Apply a batch of block ops and store the result as a **proposal**, leaving
 * `Document.head` alone.
 *
 * That is the whole of the gate (agent-gating §1): the write and the commit were
 * always two operations, and gating is a matter of not doing the second. The row
 * goes to storage with `proposedAt` set, where the app can show it and nothing
 * that serves the document will reach it; approval moves the pointer, rejection
 * deletes it.
 *
 * Successive batches squash into that one row rather than accumulating — see
 * `upsertProposal`, which does the `version` compare-and-set and re-folds on a
 * miss. `base` is used only if there is no proposal yet: on a squash the
 * original base is carried through untouched, which is the one invariant in this
 * design with no database constraint behind it (§3.2, §9).
 *
 * There is deliberately **no guard on `head`** here. `stateHash` covers the
 * window between the agent's read and this write — a mismatch means the
 * addresses no longer point where they did — and nothing covers the window
 * between this write and the author's click, by design: that compare-and-set is
 * at approval time, where a human can resolve the conflict (§3.8). No caller may
 * report otherwise.
 */
export async function proposeOps(
  input: ProposeOpsInput,
): Promise<ProposeOpsResult> {
  const post = await readAgentState(input.documentId, {
    ownedBy: input.ownedBy,
  });
  if (!post) {
    return {
      ok: false,
      reason: "not-found",
      message: `Document ${input.documentId} not found.`,
    };
  }

  let applied: ApplyResult;
  try {
    applied = applyOps(post.state, input.stateHash, input.ops);
  } catch (error) {
    const message = (error as Error).message;
    // `StaleStateError` is the recoverable one and says so in its own message;
    // everything else out of `applyOps` (a malformed block, an empty batch)
    // describes a request that was wrong when it was made.
    //
    // With one exception, which is why `code` is carried through: an op naming
    // a block that is not there is a 400 by status and a re-read by recovery.
    // Lumping it in unlabelled told the agent the opposite of what to do.
    if (error instanceof StaleStateError) {
      return { ok: false, reason: "stale", message };
    }
    const code: OpErrorCode | undefined = error instanceof OpError
      ? error.code
      : undefined;
    return code
      ? { ok: false, reason: "invalid", message, code }
      : { ok: false, reason: "invalid", message };
  }

  // What the batch deletes, named while the addresses still resolve — this is
  // the only moment they do (docs/plans/claude-code-backlog.md §5). It rides on
  // `summary`, which the rail row and `AgentChangeBar` already render, so a
  // canvas leaving the document says so on both without either surface having
  // to load a revision to find out. Nothing else writes this field today.
  const removed = describeRemovals(deletedNodes(post.state, input.ops));

  const proposal = await upsertProposal({
    documentId: post.id,
    authorId: input.authorId,
    // Whom the change feed announces this to: the document's owner, who is the
    // person entitled to review it — not `authorId`, which on a collaborative
    // document is whichever visitor's agent wrote it.
    ownerId: post.ownerId,
    data: applied.state,
    ops: input.ops,
    origin: input.origin,
    summary: withRemovalNote(input.summary, removed),
    base: post.base,
  });

  return {
    ok: true,
    document: { id: post.id, name: post.name },
    proposal,
    // `version` counts folds, so 0 means this call created the row — but a
    // replacement is also version 0, and the two must not be reported alike.
    outcome: proposal.replaced
      ? "replaced"
      : proposal.version > 0
      ? "squashed"
      : "created",
    changed: applied.changed,
    state: applied.state,
    stateHash: applied.stateHash,
  };
}

// ─── Creating a post ─────────────────────────────────────────────────────────

export interface ProposeNewPostInput {
  authorId: string;
  title: string;
  blocks: readonly WritableBlock[];
  /** `Document.agentOrigin` — the agent's own name. */
  origin: string;
  /** Series to file it under. Must belong to `authorId`. */
  seriesId?: string | null;
}

export type ProposeNewPostResult =
  | {
    ok: true;
    id: string;
    revisionId: string;
    stateHash: string;
    blockCount: number;
  }
  | {
    ok: false;
    reason: "series-not-found" | "invalid-blocks";
    message: string;
  };

/**
 * Create a document from blocks. **This one lands** rather than proposing —
 * which is why the name is the plan's (§4.4.1) rather than the truth.
 *
 * A create has no head to withhold and overwrites nothing, so gating it would
 * hold back a document that cannot conflict with anything (§3.7). It is flagged
 * instead: `agentCreatedAt` / `agentOrigin` put it in the author's
 * accept-or-discard list (`findAgentCreatedDocuments`), and `published` defaults
 * to false, so "lands normally" is not "goes live" — nobody else can read it
 * until the author publishes it. That reasoning is the same for every agent,
 * which is why both of them come through here.
 */
export async function proposeNewPost(
  input: ProposeNewPostInput,
): Promise<ProposeNewPostResult> {
  const seriesId = input.seriesId ?? null;
  if (seriesId) {
    // Scoped to the author: filing a post into someone else's series is not a
    // thing an agent may do, whoever asked.
    const series = await prisma.series.findFirst({
      where: { id: seriesId, authorId: input.authorId },
      select: { id: true },
    });
    if (!series) {
      return {
        ok: false,
        reason: "series-not-found",
        message: `Series ${seriesId} not found (or not yours).`,
      };
    }
  }

  let state: StoredState;
  try {
    state = stateFromBlocks(input.blocks);
  } catch (error) {
    return {
      ok: false,
      reason: "invalid-blocks",
      message: (error as Error).message,
    };
  }

  const id = randomUUID();
  const revisionId = randomUUID();
  const rank = await rankForAppend(prisma, {
    authorId: input.authorId,
    seriesId,
    parentId: null,
  });
  // The one write in this codebase that does not go through a repository, so it
  // is the one hand-placed notify (docs/plans/archive/changes-detection.md §2.1) —
  // everything else here reaches Postgres through `src/repositories/*`, which
  // emits on its own. Inside the transaction, so the browser only hears about a
  // post that actually committed. `null` means the payload could not be built;
  // the create then goes ahead unannounced rather than failing, and §3's
  // catch-up picks the post up.
  const notification = changeNotification({
    kind: "document.created",
    id,
    authorId: input.authorId,
    origin: input.origin,
  });
  await prisma.$transaction([
    prisma.document.create({
      data: {
        id,
        name: input.title,
        authorId: input.authorId,
        type: DocumentType.DOCUMENT,
        rank,
        seriesId,
        head: revisionId,
        agentCreatedAt: new Date(),
        agentOrigin: input.origin,
      },
    }),
    prisma.revision.create({
      data: {
        id: revisionId,
        documentId: id,
        authorId: input.authorId,
        data: state as object,
        // With the content, always (docs/plans/blob-storage.md §3).
        blobHashes: blobHashesFor(state),
        // Stamped here as well as on the document. `Document.agentOrigin`
        // answers "who created this post", but a revision list is where you
        // look to ask what wrote a particular state, and this one was arriving
        // null while every revision `proposeOps` writes carried its origin.
        origin: input.origin,
      },
    }),
    ...(notification ? [notification] : []),
  ]);

  // This create does not go through `createDocument`, so the container's order
  // array is maintained here too (docs/plans/ordering-simplification.md §6).
  await addToOrder(
    prisma,
    containerOf({ authorId: input.authorId, seriesId, parentId: null }),
    [id],
  );

  // Blocks copied from another post can carry a blob reference into a post that
  // has never seen an upload (docs/plans/blob-storage.md §3).
  await reconcileDocumentBlobs(id);

  return {
    ok: true,
    id,
    revisionId,
    stateHash: stateHash(state),
    blockCount: input.blocks.length,
  };
}
