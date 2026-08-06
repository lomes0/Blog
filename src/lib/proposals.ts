/**
 * Agent proposals, as arithmetic over rows.
 *
 * A `Revision` with `proposedAt` set is a *pending agent write*: it is in
 * storage, but `Document.head` does not point at it, so it is not the document.
 * Approval moves the pointer; rejection deletes the row. See
 * `docs/plans/agent-gating.md` — §3.2 (the squash) and §3.4 (approve/reject).
 *
 * Three decisions live here, and every one is the kind that loses work silently
 * when it goes wrong:
 *
 * **Which row is the document.** `head` names it — but a repair, when `head`
 * names nothing (its revision was deleted, see `findDocument`), must fall back
 * to the newest row that is *not* a proposal. Falling back to the newest row
 * full stop promotes an unreviewed agent write to head with no user action and
 * no compare-and-set. `selectHead` answers both halves at once so a caller
 * cannot take the first and improvise the second.
 *
 * **Which row an agent reads.** The opposite answer: the pending proposal,
 * when there is one, so that a second batch sees the first batch's work rather
 * than addressing blocks as they were before it. `selectAgentRead` also keeps
 * the two things a call site is apt to conflate apart — the state that was read
 * and the `head` a created proposal records as its base.
 *
 * **What a second batch does to the first.** Successive agent writes squash
 * into one pending row: ops append, `version` advances, `createdAt` refreshes.
 * `baseRevisionId` is written **once**, on creation, and a squash must not
 * touch it — approval's compare-and-set uses it as `expectedHead`, so a
 * refreshed base makes that CAS match a state the proposal's content never saw
 * and overwrites an intervening save with no 409. `foldProposal` expresses that
 * by leaving the column out of the patch entirely (§3.2, §9).
 *
 * This module has **no imports on purpose**. It is the part that is decidable
 * without a database: `repositories/revision.ts` and `repositories/document.ts`
 * supply rows and execute plans, and `__tests__/proposals.test.ts` exercises
 * every rule above with neither Prisma nor a DOM.
 */

// ─── Rows ────────────────────────────────────────────────────────────────────

/** The columns head selection needs. A superset is fine — it is generic. */
export interface RevisionRow {
  id: string;
  createdAt: Date;
  /** Non-null means "pending proposal", i.e. not history. */
  proposedAt: Date | null;
}

/** Is this row a pending proposal rather than a piece of history? */
export const isProposal = (row: Pick<RevisionRow, "proposedAt">): boolean =>
  row.proposedAt !== null && row.proposedAt !== undefined;

/** The rows that are history: everything a revision list may show. */
export const historyOf = <R extends Pick<RevisionRow, "proposedAt">>(
  rows: readonly R[],
): R[] => rows.filter((row) => !isProposal(row));

// ─── Head selection ──────────────────────────────────────────────────────────

export interface HeadSelection<R> {
  /**
   * The row `head` names — null when `head` is null, names no row in `rows`, or
   * names a *proposal*. The last case is a broken state rather than an
   * impossible one (nothing constrains `head` to non-proposals), and serving a
   * proposal as head is exactly the bug this module exists to prevent.
   */
  revision: R | null;
  /**
   * The row a repair should promote when `revision` is null: the newest row
   * that is not a proposal, or null when the document has no history at all.
   */
  repair: R | null;
}

/**
 * Which row is the document, and which row a repair falls back to.
 *
 * Ties on `createdAt` are broken by the caller's order — the first row wins —
 * so passing rows already sorted newest-first (as every caller here does)
 * makes the answer that sort's answer rather than a second, disagreeing one.
 */
export const selectHead = <R extends RevisionRow>(
  rows: readonly R[],
  head: string | null | undefined,
): HeadSelection<R> => {
  const named = head ? rows.find((row) => row.id === head) ?? null : null;
  const revision = named && !isProposal(named) ? named : null;

  let repair: R | null = null;
  for (const row of rows) {
    if (isProposal(row)) continue;
    if (!repair || row.createdAt.getTime() > repair.createdAt.getTime()) {
      repair = row;
    }
  }

  return { revision, repair };
};

// ─── What an agent reads ─────────────────────────────────────────────────────

/**
 * The three things a read has to choose between, gathered by the caller.
 *
 * `committed` is the document as everyone else sees it: the row `head` names,
 * or — when `head` names nothing, because its revision was deleted — the row
 * `selectHead`'s `repair` picks. Never a proposal; that is `pending`'s job.
 */
export interface AgentSources<R> {
  /** `Document.head`, exactly as read. */
  head: string | null;
  /** The document's pending proposal, if it has one. */
  pending: R | null;
  /** The committed state, if the document has any content at all. */
  committed: R | null;
}

export interface AgentRead<R> {
  /** Which of the two states was chosen — worth reporting, since they differ. */
  source: "proposal" | "committed" | "empty";
  /** The row to read content from, or null for a document with nothing in it. */
  revision: R | null;
  /**
   * What a write built on this read records as `baseRevisionId` when it
   * *creates* the proposal: the document's `head` as read, and **never the row
   * that was read**.
   *
   * The two diverge the moment a proposal exists, which is exactly when getting
   * it wrong stops being harmless: recording the proposal's own id would make
   * approval's compare-and-set (`head === baseRevisionId`) test a value head
   * never held, so approval could only ever 409 — or, worse, match after the
   * proposal was approved once and re-approve stale content over a later save.
   * On a squash the field is not written at all (§3.2); this value is used only
   * on the first batch.
   */
  base: string | null;
}

/**
 * Which state an agent reads, and what a write built on it is based on.
 *
 * **The pending proposal wins.** If Claude rewrites block 2 and then asks for
 * the outline again, it must see its own edit — otherwise the second batch
 * addresses blocks that no longer say what it thinks, and the fold silently
 * discards the first (§3.2, and the first risk in §9). "Two sources of what the
 * document says" is the standing hazard in this design, so the choice is made
 * here, once, rather than by whichever query a call site happened to run.
 *
 * Deliberate, not incidental: an ordering like `orderBy createdAt desc` would
 * usually return the proposal too, and be wrong the moment it did not.
 */
export const selectAgentRead = <R>(
  sources: AgentSources<R>,
): AgentRead<R> => {
  const base = sources.head ?? null;
  if (sources.pending) {
    return { source: "proposal", revision: sources.pending, base };
  }
  if (sources.committed) {
    return { source: "committed", revision: sources.committed, base };
  }
  return { source: "empty", revision: null, base };
};

// ─── The squash ──────────────────────────────────────────────────────────────

/** The pending row a batch folds onto, as read back before the fold. */
export interface PendingProposal {
  id: string;
  /** CAS token — the fold's write must still find this value (§3.2). */
  version: number;
  /** Write-once. Whatever this is, the fold carries it through unchanged. */
  baseRevisionId: string | null;
  /** Whatever the `ops` Json column holds. Normalized by the fold. */
  ops: unknown;
  origin: string | null;
  summary: string | null;
  proposedAt: Date;
}

/** One agent write, on its way into the pending row. */
export interface ProposalBatch {
  /** The materialized state after this batch — what the diff view renders. */
  data: unknown;
  /** The ops this batch applied, appended to whatever is already stored. */
  ops: readonly unknown[];
  origin: string | null;
  /** One line for the rail. Omitted (or null) keeps the existing summary. */
  summary?: string | null;
  /**
   * The head this batch read.
   *
   * Used **only** when the proposal is created. On a squash it is ignored: the
   * batch read the pending proposal, not head, so what head is now says nothing
   * about what this content was built on (§3.2).
   */
  base: string | null;
  /** Now, supplied rather than read, so the fold stays pure. */
  at: Date;
}

/** Every proposal column, as the row will read once the plan is executed. */
export interface ProposalRowState {
  data: unknown;
  ops: unknown[];
  origin: string | null;
  summary: string | null;
  baseRevisionId: string | null;
  proposedAt: Date;
  createdAt: Date;
  version: number;
}

/**
 * The columns a squash writes.
 *
 * `baseRevisionId` is absent from the *type*, not merely from the value: a
 * write built from this cannot touch the base even by accident, which is the
 * one invariant in this plan with no database constraint behind it (§9).
 */
export type ProposalPatch = Omit<ProposalRowState, "baseRevisionId">;

export type SquashPlan =
  | {
    kind: "create";
    /** The whole row, base included — the only place the base is set. */
    row: ProposalRowState;
  }
  | {
    kind: "squash";
    id: string;
    /** `updateMany where { id, version: expectedVersion }`; a miss means
     * re-read and re-fold, because someone else folded first. */
    expectedVersion: number;
    patch: ProposalPatch;
    /** The row as it will read afterwards, for callers that want to answer
     * without a second query. Carries the *existing* base. */
    row: ProposalRowState;
  };

/**
 * `ops` as an array, whatever the Json column actually held.
 *
 * A non-array is not something this module ever writes, so it is corruption —
 * but it is someone's work, so it is kept as a single prior entry rather than
 * dropped on the floor.
 */
const opsArray = (stored: unknown): unknown[] => {
  if (stored === null || stored === undefined) return [];
  return Array.isArray(stored) ? [...stored] : [stored];
};

/**
 * Fold a batch onto the pending proposal, or create one if there is none.
 *
 * Pass `null` for `existing` only after actually looking — folding onto `null`
 * when a proposal exists discards the earlier batch, silently and invisibly
 * until approval (§9, first risk).
 */
export const foldProposal = (
  existing: PendingProposal | null,
  batch: ProposalBatch,
): SquashPlan => {
  if (!existing) {
    return {
      kind: "create",
      row: {
        data: batch.data,
        ops: [...batch.ops],
        origin: batch.origin,
        summary: batch.summary ?? null,
        // The one and only write of this column.
        baseRevisionId: batch.base,
        proposedAt: batch.at,
        createdAt: batch.at,
        version: 0,
      },
    };
  }

  const patch: ProposalPatch = {
    data: batch.data,
    ops: [...opsArray(existing.ops), ...batch.ops],
    // A later batch may name its origin or leave it; it never blanks one.
    origin: batch.origin ?? existing.origin,
    summary: batch.summary ?? existing.summary,
    // Still pending, and pending since the *first* batch — the proposal's age
    // is how long you have had something to review, not how long ago the agent
    // last touched it. `createdAt` carries the latter.
    proposedAt: existing.proposedAt,
    createdAt: batch.at,
    version: existing.version + 1,
  };

  return {
    kind: "squash",
    id: existing.id,
    expectedVersion: existing.version,
    patch,
    row: { ...patch, baseRevisionId: existing.baseRevisionId },
  };
};

// ─── Approval ────────────────────────────────────────────────────────────────

export type ApprovalPlan =
  | {
    /** The base stopped being head, so the proposal's content is built on a
     * state that no longer exists. Refuse rather than rebase (§3.6). */
    kind: "stale";
  }
  | {
    kind: "approve";
    /**
     * The compare-and-set value for `Document.head` — the proposal's
     * `baseRevisionId`, **not** whatever head is now. That is what makes the
     * CAS the staleness check for free: if you saved in between, head has moved
     * off the base, the guarded update matches nothing, and approval 409s
     * instead of quietly discarding your edit (§3.4).
     */
    expectedHead: string | null;
    /** What turns the row into history. Everything else — `ops`, `origin`,
     * `baseRevisionId` — is kept as provenance (§3.3: approval keeps the ops). */
    patch: { proposedAt: null; staleAt: null };
  };

export const planApproval = (
  proposal: { baseRevisionId: string | null; staleAt: Date | null },
): ApprovalPlan =>
  proposal.staleAt
    ? { kind: "stale" }
    : {
      kind: "approve",
      expectedHead: proposal.baseRevisionId,
      patch: { proposedAt: null, staleAt: null },
    };
