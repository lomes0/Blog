import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Revision } from "@/types";
import { unstable_cache } from "next/cache";
import { randomUUID } from "node:crypto";
import {
  foldProposal,
  type PendingProposal,
  planApproval,
  type ProposalRowState,
} from "@/lib/proposals";

/**
 * A revision as stored, including whether it is a pending agent proposal.
 *
 * `proposedAt` is on the select because authorization has to branch on it: a
 * revision on a *published* post is readable by anyone holding its id
 * (`requireRevision(…, "read")`), and a proposal must be owner-only whatever
 * the document's publication state. Phase 2 of docs/plans/agent-gating.md adds
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
const getCachedRevision = async (id: string): Promise<StoredRevision | null> => {
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

// ─── Agent proposals (docs/plans/agent-gating.md) ────────────────────────────

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

/** What a caller must supply to fold one agent batch into the proposal. */
export interface ProposalInput {
  documentId: string;
  authorId: string;
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
});

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

const toRecord = (
  id: string,
  documentId: string,
  row: ProposalRowState,
): ProposalRecord => ({
  id,
  documentId,
  version: row.version,
  baseRevisionId: row.baseRevisionId,
  proposedAt: row.proposedAt,
  createdAt: row.createdAt,
  origin: row.origin,
  summary: row.summary,
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
 */
const upsertProposal = async (
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

    if (plan.kind === "create") {
      const id = input.id ?? randomUUID();
      try {
        await prisma.revision.create({
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
        return toRecord(id, input.documentId, plan.row);
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

export type ApproveResult =
  | { ok: true; head: string }
  | { ok: false; reason: "not-found" | "stale" | "conflict" };

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
 */
const approveProposal = async (
  documentId: string,
  revisionId: string,
): Promise<ApproveResult> =>
  prisma.$transaction(async (tx): Promise<ApproveResult> => {
    const proposal = await tx.revision.findFirst({
      where: { id: revisionId, documentId, proposedAt: { not: null } },
      select: { id: true, baseRevisionId: true, staleAt: true },
    });
    if (!proposal) return { ok: false, reason: "not-found" };

    const plan = planApproval(proposal);
    if (plan.kind === "stale") return { ok: false, reason: "stale" };

    const { count } = await tx.document.updateMany({
      where: { id: documentId, head: plan.expectedHead },
      data: { head: revisionId },
    });
    if (count === 0) return { ok: false, reason: "conflict" };

    // Clearing `proposedAt` is what turns the row into history — and it is what
    // frees the document's single pending slot. `ops`, `origin` and
    // `baseRevisionId` stay: approval keeps the batches (§3.3), and they are
    // the record of where this revision came from.
    await tx.revision.update({ where: { id: revisionId }, data: plan.patch });
    return { ok: true, head: revisionId };
  });

/**
 * Throw the proposal away. No `rejectedAt`, no retention, no extra filter on
 * every history read — the content is regenerable and you refused it on purpose
 * (§3.4).
 *
 * Returns false when there was no pending proposal by that id on that document,
 * so a double reject is a clean answer rather than a 500.
 */
const rejectProposal = async (documentId: string, revisionId: string) => {
  const { count } = await prisma.revision.deleteMany({
    where: { id: revisionId, documentId, proposedAt: { not: null } },
  });
  return count > 0;
};

export {
  approveProposal,
  countPendingProposals,
  createRevision,
  deleteRevision,
  findPendingProposal,
  findRevisionAuthorId,
  findRevisionDocumentId,
  getCachedRevision,
  isPendingProposal,
  rejectProposal,
  updateRevision,
  upsertProposal,
};
