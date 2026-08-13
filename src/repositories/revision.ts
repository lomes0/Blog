import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Revision } from "@/types";
import { unstable_cache } from "next/cache";
import { randomUUID } from "node:crypto";
import {
  type ApprovalDecisions,
  foldProposal,
  noteApplied,
  type PendingProposal,
  planApproval,
  planStaleMarking,
  type ProposalRowState,
} from "@/lib/proposals";
import {
  applyDecisions,
  diffProposal,
  UnknownHunkError,
} from "@/lib/proposalDiff";
import { emptyState } from "@/lib/content-bridge/ops";
import type { StoredState } from "@/lib/content-bridge/types";
import { APP_ORIGIN } from "@/lib/changes/events";
import { notifyChange } from "@/lib/changes/notify";

/**
 * A revision as stored, including whether it is a pending agent proposal.
 *
 * `proposedAt` is on the select because authorization has to branch on it: a
 * revision on a *published* post is readable by anyone holding its id
 * (`requireRevision(…, "read")`), and a proposal must be owner-only whatever
 * the document's publication state. Phase 2 of docs/plans/archive/agent-gating.md adds
 * that check; the column is here so it has something to read.
 */
export type StoredRevision = Revision & { proposedAt: Date | null };

const revisionSelect = {
  id: true,
  documentId: true,
  createdAt: true,
  proposedAt: true,
  data: true,
} as const;

const findRevisionById = async (id: string): Promise<StoredRevision | null> => {
  const revision = await prisma.revision.findUnique({
    where: { id },
    select: revisionSelect,
  });
  if (!revision) return null;
  return {
    ...revision,
    data: revision.data as unknown as Revision["data"],
  };
};

const cachedRevision = unstable_cache(findRevisionById, [], {
  tags: ["revision"],
});

/**
 * A revision, from cache unless it is a proposal.
 *
 * `unstable_cache` here has no `revalidate` and nothing in the app calls
 * `revalidateTag("revision")`, which was harmless while a revision id named
 * immutable content. A proposal is the opposite: one id is **rewritten in
 * place** on every agent batch (§3.2), and `GET /api/revisions/[id]` is how the
 * review UI fetches it — so a cached proposal means reviewing batch one while
 * batch five is what approval would apply.
 *
 * Of the two fixes §2.1 offers, this is the bypass rather than the
 * revalidation: `upsertProposal` is called from `mcp/content-server.ts`, a
 * plain stdio process with no Next request scope, where `revalidateTag` throws.
 * A guard the writer cannot always run is not a guard.
 *
 * The cached value is only ever *consulted* for the flag — an id that was
 * cached while pending re-reads for the rest of the process's life, including
 * after approval clears the flag, which costs one query on a handful of ids and
 * cannot serve stale content.
 */
const getCachedRevision = async (
  id: string,
): Promise<StoredRevision | null> => {
  const cached = await cachedRevision(id);
  if (cached && cached.proposedAt) return findRevisionById(id);
  return cached;
};

/**
 * Is this revision id a pending agent proposal?
 *
 * For the callers that render a revision straight from an id and have nothing
 * else to branch on — see `src/app/api/utils.ts`, where `/embed` and `/view`
 * take one from `?v=`. Deliberately uncached and deliberately narrow: the row is
 * rewritten in place on every batch, and the answer must not be a stale `true`
 * that outlives approval.
 */
const isPendingProposal = async (id: string): Promise<boolean> => {
  const row = await prisma.revision.findUnique({
    where: { id },
    select: { proposedAt: true },
  });
  return !!row?.proposedAt;
};

/** The document a revision belongs to, or undefined if there is no such revision. */
const findRevisionDocumentId = async (id: string) => {
  const revision = await prisma.revision.findUnique({
    where: { id },
    select: { documentId: true },
  });
  return revision?.documentId;
};

const findRevisionAuthorId = async (id: string) => {
  const revision = await prisma.revision.findUnique({
    where: { id },
    select: {
      authorId: true,
    },
  });
  return revision?.authorId;
};

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

/**
 * An ordinary revision write was aimed at a row that is a pending proposal.
 *
 * Its own class so the route can answer 409 rather than 500 — and so that
 * "you tried to autosave onto something under review" is never mistaken for a
 * bug.
 */
export class ProposalWriteError extends Error {
  constructor(readonly revisionId: string) {
    super("That revision is a pending proposal and cannot be written to");
    this.name = "ProposalWriteError";
  }
}

/**
 * Create a revision, or rewrite one already open under the same id.
 *
 * The editor folds a stretch of autosaves into a single revision (see
 * `useSave`), so re-posting a known id means "this revision's content moved on"
 * rather than "duplicate, ignore me" — the update has to be real. Only `data`
 * and `createdAt` move; the row keeps its document and author.
 *
 * **The update arm refuses a pending proposal.** It is a guarded `updateMany`
 * rather than a read-then-write for the usual reason — the check and the write
 * are one statement, so nothing can slip between them — and it is an invariant
 * rather than a convention because the review surface is itself a write path:
 * `components/Diff/index.tsx` still carries a fallback that dispatches
 * `createRevision`, and phase 4 hands it proposal ids (§2.1, fifth gotcha).
 *
 * Callers are responsible for checking that the id belongs to the document
 * being written (see the POST /api/revisions route) — without that, a forged id
 * would let this overwrite someone else's revision.
 */
const createRevision = async (data: Prisma.RevisionUncheckedCreateInput) => {
  const id = data.id as string;

  // Two passes rather than one so that losing a race to an identical create is
  // retried instead of being reported as a proposal collision. Exhausting them
  // means the guarded update missed while the row demonstrably exists, and the
  // only thing that produces that is `proposedAt IS NOT NULL`.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { count } = await prisma.revision.updateMany({
      where: { id, proposedAt: null },
      data: { data: data.data, createdAt: data.createdAt },
    });
    if (count > 0) return prisma.revision.findUniqueOrThrow({ where: { id } });

    try {
      return await prisma.revision.create({ data });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  throw new ProposalWriteError(id);
};

const updateRevision = async (id: string, data: Prisma.RevisionUpdateInput) => {
  return prisma.revision.update({
    where: { id },
    data,
  });
};

const deleteRevision = async (id: string) => {
  return prisma.revision.delete({
    where: { id },
  });
};

// ─── Agent proposals (docs/plans/archive/agent-gating.md) ────────────────────────────

const pendingSelect = {
  id: true,
  documentId: true,
  authorId: true,
  createdAt: true,
  proposedAt: true,
  origin: true,
  baseRevisionId: true,
  ops: true,
  summary: true,
  staleAt: true,
  version: true,
  data: true,
} as const;

export type PendingProposalRow = Prisma.RevisionGetPayload<
  { select: typeof pendingSelect }
>;

/**
 * The document's pending proposal, content included, or null.
 *
 * Never cached: the row is rewritten in place on every batch, and this is the
 * read a squash folds onto.
 */
const findPendingProposal = async (
  documentId: string,
): Promise<PendingProposalRow | null> =>
  prisma.revision.findFirst({
    where: { documentId, proposedAt: { not: null } },
    select: pendingSelect,
  });

/**
 * How many of this author's documents have a proposal waiting for review.
 *
 * Scoped through the document's `authorId` and not the *revision's*: the
 * proposal is written by whoever the agent authenticates as, and the person who
 * has to answer for it is the one who owns the document — the same line
 * `requireDocument(…, "own")` draws for approving it.
 *
 * Counting revisions and counting documents are the same number here, because
 * `revision_one_pending_per_document` makes at most one pending row per document
 * a database fact (§3.1).
 */
const countPendingProposals = async (authorId: string) =>
  prisma.revision.count({
    where: { proposedAt: { not: null }, document: { authorId } },
  });

/**
 * What the rail renders for one pending proposal. Metadata only — no `data`.
 *
 * This is the **dedicated pending fetch** phase 4 was allowed to add instead of
 * loosening the history filter (docs/plans/archive/agent-gating.md §2.1, phase 4). The
 * filter stays `proposedAt: null` in `revisionsSelect` where phase 1 put it: it
 * covers every caller in one place, and the alternative — letting proposals
 * through there — has to be right on *both* arms of `toCloudDocument`, where the
 * `collab` arm filters nothing at all and would serve a proposal dressed as
 * history. A separate query is a smaller surface than a shared one with two
 * meanings.
 *
 * `head` comes along because the review diff's left-hand side is the document's
 * current head, and the rail must be able to offer "Review" for a document that
 * is not open and therefore not in the store.
 *
 * `baseRevisionId` is *not* the same thing: it is the head the proposal was
 * built on, which approval compare-and-sets against (§3.4). They differ exactly
 * when the proposal has gone stale, which is the phase-5 case.
 */
const proposalSummarySelect = {
  id: true,
  documentId: true,
  // The reviewer's compare-and-set token. Listed rather than fetched per
  // proposal because the review surface needs it on the row it was offered, and
  // a second query for one integer would be a round trip per opened review.
  version: true,
  proposedAt: true,
  origin: true,
  summary: true,
  baseRevisionId: true,
  staleAt: true,
  document: { select: { name: true, handle: true, head: true } },
} as const;

export type ProposalSummaryRow = Prisma.RevisionGetPayload<
  { select: typeof proposalSummarySelect }
>;

/**
 * Every proposal waiting on this author, newest first.
 *
 * Scoped through `document.authorId` for the same reason `countPendingProposals`
 * is: the proposal's own author is whoever the agent signed in as, and the
 * person entitled to see it is the one who owns the document. Nothing here is
 * readable by anyone else — the route is `userRoute` and passes its own
 * `user.id`, never an id from the request.
 *
 * Uncached, like `findPendingProposal`: a proposal row is rewritten in place on
 * every agent batch, so a cached listing would advertise a summary that no
 * longer describes the content approval would apply.
 */
const findPendingProposalsByAuthor = async (
  authorId: string,
): Promise<ProposalSummaryRow[]> =>
  prisma.revision.findMany({
    where: { proposedAt: { not: null }, document: { authorId } },
    select: proposalSummarySelect,
    orderBy: { proposedAt: "desc" },
  });

/**
 * Stamp every pending proposal on a document stale, because `head` has moved off
 * the base they were built on (docs/plans/archive/agent-gating.md §3.6).
 *
 * **Takes a transaction client rather than opening one.** It has to commit with
 * the head move: a crash in between would leave a proposal the compare-and-set
 * will refuse — no work lost, but the rail would go on offering "Approve" for a
 * button that can only 409, and nothing would ever come back to fix it, since
 * the marker only runs when head moves. Every caller therefore already has a
 * transaction open, and the one that did not (the unconditional arm of
 * `updateDocument`) grew one.
 *
 * The decision is `planStaleMarking`'s, not this function's, and the round trip
 * is a read then a write rather than one `updateMany` with a `NOT`: in SQL
 * `NOT ("baseRevisionId" = $1)` is *unknown*, and therefore false, for the row
 * whose base is null — the proposal written against an empty document, which is
 * the one that most needs stamping.
 */
const markProposalsStale = async (
  tx: Prisma.TransactionClient,
  document: Prisma.DocumentWhereInput,
  nextHead: string | null,
  at: Date = new Date(),
): Promise<number> => {
  const pending = await tx.revision.findMany({
    where: { document, proposedAt: { not: null } },
    select: { id: true, baseRevisionId: true, staleAt: true },
  });
  // The overwhelmingly common case: no document has a proposal, so an ordinary
  // save pays one indexed lookup and stops.
  if (pending.length === 0) return 0;

  const plan = planStaleMarking(pending, nextHead, at);
  if (plan.ids.length === 0) return 0;

  const { count } = await tx.revision.updateMany({
    // `staleAt: null` a second time: the first stamp is the one that names when
    // the document moved on, and a concurrent marker must not push it forward.
    where: { id: { in: plan.ids }, staleAt: null },
    data: { staleAt: plan.at },
  });
  return count;
};

/** What a caller must supply to fold one agent batch into the proposal. */
export interface ProposalInput {
  documentId: string;
  /** The *revision's* author: whoever the agent authenticated as. */
  authorId: string;
  /**
   * The **document's** owner, for the change feed's fan-out — the person
   * entitled to review this, which is not always the person who wrote it.
   *
   * Defaults to `authorId`, which is the right answer on every path that
   * predates `POST /api/documents/[id]/proposals`: `mcp/content-server.ts`
   * scopes every read and write to `MCP_AUTHOR_ID`, so writer and owner are the
   * same user. The HTTP route authorizes with `requireDocument(…, "write")`,
   * which a *collaborator* satisfies — and announcing that batch to the
   * collaborator would leave the owner's review rail silent until the next
   * reconnect catch-up. See {@link upsertProposal}, which is where this
   * distinction was predicted.
   */
  ownerId?: string;
  /** Id for the row if one has to be created. Ignored on a squash. */
  id?: string;
  /** The materialized state after this batch. */
  data: unknown;
  /** The ops this batch applied; appended to whatever is stored (§3.3). */
  ops: readonly unknown[];
  origin: string | null;
  summary?: string | null;
  /**
   * The head this batch read. Recorded as `baseRevisionId` **only** when the
   * proposal is created — a squash carries the original through untouched, and
   * that is the invariant approval's compare-and-set rests on (§3.2).
   */
  base: string | null;
  /** Now, injectable for tests. */
  at?: Date;
}

/** What the caller gets back: enough to report and to poll, without the state. */
export interface ProposalRecord {
  id: string;
  documentId: string;
  version: number;
  baseRevisionId: string | null;
  proposedAt: Date;
  createdAt: Date;
  origin: string | null;
  summary: string | null;
  /**
   * The stale proposal this write superseded, if there was one (§3.6).
   *
   * Non-null means the author had edited the document since the previous batch,
   * so that batch's row could no longer be approved and this one started over
   * against the current content. The agent has to be able to say so — it is the
   * difference between "folded into what I proposed earlier" and "your earlier
   * proposal is gone".
   */
  replaced: string | null;
}

const toPending = (row: PendingProposalRow): PendingProposal => ({
  id: row.id,
  version: row.version,
  baseRevisionId: row.baseRevisionId,
  ops: row.ops,
  origin: row.origin,
  summary: row.summary,
  // Narrowed by the `proposedAt: { not: null }` the row was fetched under.
  proposedAt: row.proposedAt as Date,
  staleAt: row.staleAt,
});

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

const toRecord = (
  id: string,
  documentId: string,
  row: ProposalRowState,
  replaced: string | null = null,
): ProposalRecord => ({
  id,
  documentId,
  version: row.version,
  baseRevisionId: row.baseRevisionId,
  proposedAt: row.proposedAt,
  createdAt: row.createdAt,
  origin: row.origin,
  summary: row.summary,
  replaced,
});

/**
 * Fold one agent batch into the document's single pending proposal, creating it
 * if there is none. **Leaves `Document.head` alone** — that is the whole point.
 *
 * Not `prisma.revision.upsert`, despite the name: uniqueness here lives in a
 * *partial* index Prisma cannot see, so `where: { documentId }` does not
 * typecheck. This is the find-then-create-or-update shape, with both races
 * handled by re-reading rather than by hoping:
 *
 * - two batches creating at once → one gets `P2002` from
 *   `revision_one_pending_per_document` and re-folds onto the winner;
 * - two batches folding at once → the loser's `updateMany` matches nothing,
 *   because `version` moved, and it re-folds onto the winner (§3.2). Once
 *   `head` stops moving on an agent write, `version` is the *only* thing
 *   serializing this; `createdAt` cannot serve instead, since the squash is
 *   what rewrites it.
 *
 * A **stale** pending row is the third answer: it is replaced rather than folded
 * onto (§3.6). See `foldProposal`.
 */
const writeProposal = async (
  input: ProposalInput,
): Promise<ProposalRecord> => {
  const at = input.at ?? new Date();

  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await findPendingProposal(input.documentId);
    const plan = foldProposal(existing ? toPending(existing) : null, {
      data: input.data,
      ops: input.ops,
      origin: input.origin,
      summary: input.summary,
      base: input.base,
      at,
    });

    if (plan.kind === "create" || plan.kind === "replace") {
      const id = input.id ?? randomUUID();
      const create = prisma.revision.create({
        data: {
          id,
          documentId: input.documentId,
          authorId: input.authorId,
          data: asJson(plan.row.data),
          ops: asJson(plan.row.ops),
          origin: plan.row.origin,
          summary: plan.row.summary,
          baseRevisionId: plan.row.baseRevisionId,
          proposedAt: plan.row.proposedAt,
          createdAt: plan.row.createdAt,
          version: plan.row.version,
        },
      });
      try {
        if (plan.kind === "replace") {
          // One transaction, and the delete first: `revision_one_pending_per_
          // document` allows exactly one pending row, so the two statements
          // cannot be separated and cannot be reordered. Losing the stale row
          // is not a loss — it could only ever be rejected (§3.6), and this
          // batch is the re-run that replaces it.
          await prisma.$transaction([
            prisma.revision.deleteMany({
              where: { id: plan.replaces, proposedAt: { not: null } },
            }),
            create,
          ]);
        } else {
          await create;
        }
        return toRecord(
          id,
          input.documentId,
          plan.row,
          plan.kind === "replace" ? plan.replaces : null,
        );
      } catch (error) {
        // Someone else created the document's proposal between the read and
        // this insert; go round again and fold onto theirs.
        if (!isUniqueViolation(error)) throw error;
        continue;
      }
    }

    const { count } = await prisma.revision.updateMany({
      where: { id: plan.id, version: plan.expectedVersion },
      data: {
        data: asJson(plan.patch.data),
        ops: asJson(plan.patch.ops),
        origin: plan.patch.origin,
        summary: plan.patch.summary,
        proposedAt: plan.patch.proposedAt,
        createdAt: plan.patch.createdAt,
        version: plan.patch.version,
        // `baseRevisionId` is deliberately absent — see `foldProposal`.
      },
    });
    if (count === 1) return toRecord(plan.id, input.documentId, plan.row);
  }

  throw new Error(
    `Could not fold a proposal for document ${input.documentId}: ` +
      "three attempts all lost the race",
  );
};

/**
 * {@link writeProposal}, plus the `proposal.upserted` event
 * (docs/plans/archive/changes-detection.md §2.1).
 *
 * The notify is **here rather than in the three arms** of the retry loop, and
 * that is the point of the split: `create`, `replace` and `fold` are three
 * different statements with three different shapes (a bare create, a two-
 * statement array transaction, a version compare-and-set), so emitting inside
 * each would be three call sites — and worse, an attempt that *lost* the race
 * would announce a batch that never landed before going round again. Only the
 * successful return reaches this line.
 *
 * It is post-commit rather than in-transaction for the same reason there is a
 * retry loop at all: the write is one of three statements chosen at runtime,
 * and the `fold` arm has no transaction to join. §3's catch-up repairs the
 * crashed-in-between window — and for proposals specifically that is
 * `refreshProposals()`, which the reconnect sequence already runs (§3.2).
 *
 * `input.authorId` is the *revision's* author — whoever the agent authenticated
 * as — and `input.ownerId` is the document's, which is what the feed actually
 * filters on: it announces to whoever may *see* the event, the same distinction
 * `countPendingProposals` draws by scoping through `document.authorId`. They
 * coincide on the MCP path (single-user by `MCP_AUTHOR_ID`), and diverge the
 * moment a collaborator's agent proposes against a document they do not own —
 * which `POST /api/documents/[id]/proposals` permits, `write` being the mode
 * that lets a collaborator propose and `own` the one that lets the owner commit.
 * The fallback keeps every caller that has no second id to give correct.
 */
const upsertProposal = async (
  input: ProposalInput,
): Promise<ProposalRecord> => {
  const record = await writeProposal(input);
  await notifyChange(prisma, {
    kind: "proposal.upserted",
    id: record.documentId,
    revisionId: record.id,
    authorId: input.ownerId ?? input.authorId,
    origin: input.origin ?? APP_ORIGIN,
  });
  return record;
};

export type ApproveResult =
  | {
    ok: true;
    head: string;
    /**
     * Present only when the author refused something: how much of the proposal
     * became the document. Absent is the whole proposal, which is what an
     * approval with no decisions has always been.
     */
    partial?: { applied: number; total: number };
  }
  | { ok: false; reason: "not-found" | "stale" | "conflict" | "version-moved" }
  | {
    /** The client named hunks this proposal's diff does not contain. */
    ok: false;
    reason: "unknown-hunks";
    ids: string[];
  };

/**
 * The proposal row moved between the read and the write, so the approval has to
 * come apart again.
 *
 * Thrown rather than returned, and that is not a style choice: returning a value
 * from a `$transaction` callback **commits** it, and by this point `head` has
 * already been moved. The only way to unwind that is to leave through an
 * exception, so the failure travels as one and is converted back to a result
 * outside — which is why the route still sees an ordinary `ApproveResult` and
 * not a 500.
 */
class ProposalMovedError extends Error {
  constructor() {
    super("the proposal was rewritten during approval");
    this.name = "ProposalMovedError";
  }
}

/** A refusal, on its way back out of {@link materializePartial}. */
type PartialRefusal = Extract<ApproveResult, { ok: false }>;

/**
 * The state a partial approval promotes: the proposal, minus the refused hunks.
 *
 * **Nothing here comes from the client except ids.** The diff is recomputed from
 * this transaction's own two rows, and an id the recomputation does not produce
 * is a refusal rather than a silent drop — accepting a selection whose meaning
 * the two sides disagree about would apply decisions the author never made, with
 * a 200 and no way to tell (`proposalDiff.ts`'s `UnknownHunkError`).
 *
 * The base is the revision the proposal was built on. It is also, by the time
 * this runs, what `head` must still be — the compare-and-set below insists on
 * it — so diffing against it is diffing against the document, and the reviewer's
 * hunks and these hunks are the same hunks.
 *
 * `data` is read here and not in the caller's `select`, because the caller's
 * query runs on **every** approval and this one only when something was refused.
 * A whole-document Json column is not worth fetching to ignore.
 */
const materializePartial = async (
  tx: Prisma.TransactionClient,
  revisionId: string,
  baseRevisionId: string | null,
  rejected: readonly string[],
): Promise<
  | { ok: true; state: StoredState; applied: number; total: number }
  | { ok: false; refusal: PartialRefusal }
> => {
  const row = await tx.revision.findUnique({
    where: { id: revisionId },
    select: { data: true },
  });
  if (!row) return { ok: false, refusal: { ok: false, reason: "not-found" } };

  let base: StoredState;
  if (baseRevisionId === null) {
    // A proposal against a document with no head yet: every block reads as an
    // insert, which is exactly what reviewing one block at a time should show.
    base = emptyState();
  } else {
    const baseRow = await tx.revision.findUnique({
      where: { id: baseRevisionId },
      select: { data: true },
    });
    // The base revision is gone, so there is no state to review against and
    // nothing to invent one from. Reported as `conflict` because that is what
    // it is: `head` cannot honestly equal a row that does not exist, and the
    // compare-and-set is the thing that would have said so.
    if (!baseRow) return { ok: false, refusal: { ok: false, reason: "conflict" } };
    base = baseRow.data as unknown as StoredState;
  }

  const proposal = row.data as unknown as StoredState;
  const total = diffProposal(base, proposal).length;
  try {
    return {
      ok: true,
      state: applyDecisions(base, proposal, rejected),
      // Ids may repeat in a client's list without meaning two refusals.
      applied: total - new Set(rejected).size,
      total,
    };
  } catch (error) {
    if (error instanceof UnknownHunkError) {
      return {
        ok: false,
        refusal: { ok: false, reason: "unknown-hunks", ids: [...error.ids] },
      };
    }
    throw error;
  }
};

/**
 * Make the pending proposal the document: move `head` and clear the flag, in
 * **one** transaction.
 *
 * It cannot be `updateDocument` followed by a second write — `updateDocument`
 * opens its own `prisma.$transaction` and takes no `tx`, so composing the two
 * leaves a window where `head` points at a row still marked pending, which
 * every read would then serve as the document (§3.4).
 *
 * `expectedHead` is the proposal's `baseRevisionId`, never "whatever head is
 * now": that is what makes the compare-and-set the staleness check for free. A
 * miss is `"conflict"` — a distinguishable result rather than a thrown error,
 * because the route's answer to it is 409 and not 500.
 *
 * This moves `head` and deliberately does **not** call `markProposalsStale`. It
 * is the one head move that is not a save: the row arriving at head is the
 * proposal itself, so marking would stamp the thing being approved. The plan is
 * belt-and-braces about it too — `planStaleMarking` skips the row whose id is
 * the new head — but the reason it is not called here is that there is nothing
 * to mark: at most one pending proposal exists per document, and this is it.
 *
 * ### Taking only part of it
 *
 * `decisions.rejectedHunks` names hunks the author refused, and the row's `data`
 * is rewritten to the proposal minus those blocks before it becomes head. Three
 * things about that are deliberate:
 *
 * - **One path, not two.** An empty or absent selection skips the merge
 *   entirely and writes exactly what it always wrote. A partial approval is the
 *   same transaction with one extra column in the `data` argument, so there is
 *   no second approval to keep in step with this one.
 * - **The refused ops are discarded**, on `rejectProposal`'s rationale (§3.4):
 *   the content is regenerable and it was refused on purpose. Splitting the row
 *   into an approved half and a surviving pending remainder is not available —
 *   the remainder would need a *new* `baseRevisionId`, which is precisely the
 *   silent clobber §3.2 forbids, and for the length of the transaction two
 *   pending rows would exist for one document, which `revision_one_pending_
 *   per_document` refuses outright.
 * - **`ops` is left as written.** It records what the agent proposed; the
 *   approved `data` records what was accepted. Rewriting the ops to match the
 *   decision would destroy the only record of the difference, which is the one
 *   thing a partial approval creates.
 */
const approveProposal = async (
  documentId: string,
  revisionId: string,
  decisions: ApprovalDecisions = {},
): Promise<ApproveResult> => {
  try {
    return await prisma.$transaction(async (tx): Promise<ApproveResult> => {
      const proposal = await tx.revision.findFirst({
        where: { id: revisionId, documentId, proposedAt: { not: null } },
        select: {
          id: true,
          baseRevisionId: true,
          staleAt: true,
          // The squash's compare-and-set token (§3.2), read here so approval can
          // hold the row still while it merges: see `expectedVersion`.
          version: true,
          // Short, and only read on the partial path — unlike `data`, it costs
          // nothing to carry on every approval.
          summary: true,
          // For the change feed's payload, and taken from the *document* rather
          // than the revision: the person entitled to hear that a proposal was
          // resolved is the one who owns the document, the same line
          // `countPendingProposals` and the approve route both already draw. It
          // is an extra column on a query that had to run anyway, not an extra
          // round trip.
          document: { select: { authorId: true } },
        },
      });
      if (!proposal) return { ok: false, reason: "not-found" };

      const plan = planApproval(proposal, decisions);
      if (plan.kind === "stale") return { ok: false, reason: "stale" };
      if (plan.kind === "version-moved") {
        return { ok: false, reason: "version-moved" };
      }

      // Everything the merge needs is decided before anything is written, so a
      // refused selection returns from a transaction that wrote nothing.
      let content: { data: Prisma.InputJsonValue; summary: string | null } | null =
        null;
      let partial: { applied: number; total: number } | undefined;
      if (plan.rejected.length > 0) {
        const merged = await materializePartial(
          tx,
          revisionId,
          proposal.baseRevisionId,
          plan.rejected,
        );
        if (!merged.ok) return merged.refusal;
        content = {
          data: asJson(merged.state),
          summary: noteApplied(proposal.summary, merged.applied, merged.total),
        };
        partial = { applied: merged.applied, total: merged.total };
      }

      const { count } = await tx.document.updateMany({
        where: { id: documentId, head: plan.expectedHead },
        data: { head: revisionId },
      });
      if (count === 0) return { ok: false, reason: "conflict" };

      // Clearing `proposedAt` is what turns the row into history — and it is what
      // frees the document's single pending slot. `ops`, `origin` and
      // `baseRevisionId` stay: approval keeps the batches (§3.3), and they are
      // the record of where this revision came from.
      //
      // `updateMany` under a version guard rather than `update` by id, on both
      // paths. A batch that squashed onto this row after it was read would
      // otherwise be promoted to head unreviewed — the whole-proposal approval
      // had that hole before there was anything partial about it, and this is
      // the same write, fenced. A miss throws, because `head` has already moved
      // and the transaction has to come apart.
      const written = await tx.revision.updateMany({
        where: { id: revisionId, version: plan.expectedVersion },
        data: { ...plan.patch, ...(content ?? {}) },
      });
      if (written.count === 0) throw new ProposalMovedError();

      // Only here, and inside the transaction: every refusal above returns
      // without announcing, and a rollback discards these two notifications
      // along with the write (docs/plans/archive/changes-detection.md §2.1). Two events
      // rather than one because approval is genuinely both things — the proposal
      // stopped being pending, *and* `head` moved, so the document's content
      // changed and any client holding it has to re-fetch. Leaving the second to
      // be inferred from the first would put that reasoning in every consumer.
      const authorId = proposal.document.authorId;
      await notifyChange(tx, {
        kind: "proposal.resolved",
        id: documentId,
        revisionId,
        resolution: "approved",
        authorId,
        origin: APP_ORIGIN,
      });
      await notifyChange(tx, {
        kind: "document.updated",
        id: documentId,
        authorId,
        origin: APP_ORIGIN,
      });

      return { ok: true, head: revisionId, ...(partial ? { partial } : {}) };
    });
  } catch (error) {
    // The one failure that has to unwind a write it already made. Converted back
    // to a result here so the route's answer stays a 409 rather than a 500.
    if (error instanceof ProposalMovedError) {
      return { ok: false, reason: "version-moved" };
    }
    throw error;
  }
};

/**
 * Throw the proposal away. No `rejectedAt`, no retention, no extra filter on
 * every history read — the content is regenerable and you refused it on purpose
 * (§3.4).
 *
 * Returns false when there was no pending proposal by that id on that document,
 * so a double reject is a clean answer rather than a 500.
 *
 * `authorId` is a parameter for the same reason as `acceptAgentDocument`'s: this
 * is a bare `deleteMany`, so there is no row left to read the document's owner
 * off and no transaction to join, and the caller has already proved the answer
 * — the route runs `requireDocument(id, user, "own")` before it gets here. The
 * change feed fans out on that id (§2.3), so it comes from the authorized
 * document and never from the request.
 *
 * The notify is conditional on `count > 0`: a second click on a rail button
 * deleted nothing, and must not announce that it did. Rejecting leaves the
 * document itself untouched — `head` never pointed at the proposal — so this is
 * the one resolution that emits no `document.updated`.
 */
const rejectProposal = async (
  documentId: string,
  revisionId: string,
  authorId: string,
) => {
  const { count } = await prisma.revision.deleteMany({
    where: { id: revisionId, documentId, proposedAt: { not: null } },
  });
  if (count === 0) return false;

  await notifyChange(prisma, {
    kind: "proposal.resolved",
    id: documentId,
    revisionId,
    resolution: "rejected",
    authorId,
    origin: APP_ORIGIN,
  });
  return true;
};

export {
  approveProposal,
  countPendingProposals,
  createRevision,
  deleteRevision,
  findPendingProposal,
  findPendingProposalsByAuthor,
  findRevisionAuthorId,
  findRevisionDocumentId,
  getCachedRevision,
  isPendingProposal,
  markProposalsStale,
  rejectProposal,
  updateRevision,
  upsertProposal,
};
