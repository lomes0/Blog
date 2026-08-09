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
 * **When the author saves underneath.** The base stops being head, so the
 * proposal can no longer be approved: `planStaleMarking` says which rows a head
 * move invalidates, `isProposalStale` is the one question every surface asks
 * about a row, and the answer changes what an agent *reads* as well as what an
 * author may approve — a stale row is superseded by the next batch rather than
 * folded onto, which is what makes "ask Claude again against current content"
 * something that happens rather than something a document says (§3.6).
 *
 * **How much of it the author took.** Approval may accept a subset:
 * `planApproval` carries the refused hunk ids through and names the *two*
 * compare-and-sets that have to hold — `Document.head` against the base, and
 * the proposal row's own `version` against what the reviewer's hunks were
 * computed from. The ids are ids; what they mean is recomputed from the two
 * stored states by `proposalDiff.ts`, which is the only reason a client may be
 * allowed to name anything here at all.
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
  /**
   * The document's pending proposal, if it has one — with the two columns
   * staleness is decided from, because a *stale* proposal is not a state to
   * keep reading (§3.6).
   */
  pending: (R & Omit<StaleCandidate, "id">) | null;
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
  /**
   * True when the document has a pending proposal that was **not** read because
   * it has gone stale (§3.6).
   *
   * Worth reporting rather than hiding: it is the difference between "there is
   * nothing pending" and "what you proposed can no longer be approved, and the
   * content below is the author's, not yours". The next write replaces that row
   * — see `foldProposal`'s `replace` — so an agent that says nothing still does
   * the right thing, but it will describe it wrongly.
   */
  staleProposal: boolean;
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
  const stale = !!sources.pending && isProposalStale(sources.pending, base);

  // A stale proposal is the one case where the pending row loses. Its content
  // is built on a base that is no longer head, so approval refuses it — and
  // addressing blocks inside it would produce a second batch that is equally
  // unapprovable, on top of content the author has already moved past. Read
  // what the document actually says instead; the next write starts over from
  // there (§3.6, and decision 6 in §8).
  if (sources.pending && !stale) {
    return {
      source: "proposal",
      revision: sources.pending,
      base,
      staleProposal: false,
    };
  }
  if (sources.committed) {
    return {
      source: "committed",
      revision: sources.committed,
      base,
      staleProposal: stale,
    };
  }
  return { source: "empty", revision: null, base, staleProposal: stale };
};

// ─── Staleness (§3.6) ────────────────────────────────────────────────────────

/**
 * Has the document moved off the base this proposal was built on?
 *
 * Two answers in one, and they have to agree or the UI and the server say
 * different things about the same row:
 *
 * - **`staleAt`** is the stamp a head move leaves behind (`planStaleMarking`).
 *   It is what `planApproval` refuses on, so it is authoritative.
 * - **`baseRevisionId !== head`** is the same fact derived from the two
 *   pointers, and it covers the window the stamp cannot: a proposal *created*
 *   while a save was in flight is born with a base that is already not head, and
 *   no marker ran over a row that did not exist yet. Approval catches that case
 *   anyway — the compare-and-set misses — but only after the click, and a
 *   surface that has both pointers in hand can say so beforehand.
 *
 * `staleAt` is taken as a `Date` from Prisma and as an ISO string over the wire,
 * so both are accepted: the only question asked of it is whether it is set.
 */
export const isProposalStale = (
  proposal: { baseRevisionId: string | null; staleAt: Date | string | null },
  head: string | null,
): boolean =>
  Boolean(proposal.staleAt) || (head ?? null) !== proposal.baseRevisionId;

/** The columns a head move needs in order to decide what it invalidated. */
export interface StaleCandidate {
  id: string;
  baseRevisionId: string | null;
  staleAt: Date | null;
}

export interface StaleMarking {
  /** The rows to stamp. Empty is the overwhelmingly common answer. */
  ids: string[];
  /** The stamp, supplied rather than read, so the plan stays pure. */
  at: Date;
}

/**
 * Which pending proposals a head move makes unapprovable (§3.6).
 *
 * Three exclusions, and every one of them is load-bearing:
 *
 * - **already stamped** — the first stamp names when the document moved on, and
 *   an editor autosave folds into one revision id, so the same `head` value is
 *   written repeatedly. Re-stamping would walk the timestamp forward for as long
 *   as the author kept typing.
 * - **the row becoming head** — that is an approval, not a save, and it must not
 *   mark its own proposal stale on its way into history. Approval writes `head`
 *   through its own transaction rather than this path, so this is a belt on top
 *   of a brace; it costs one comparison and removes a whole class of accident
 *   from any future caller.
 * - **base already equal to the new head** — nothing moved, from this row's
 *   point of view. A repair that lands back on the base is the realistic case.
 *
 * Decided over rows here rather than in a `NOT` on the update's `where`, because
 * SQL's three-valued logic makes `NOT ("baseRevisionId" = $1)` *skip* a row
 * whose base is null — exactly the proposal built on an empty document, and
 * exactly the one that most needs the stamp.
 */
export const planStaleMarking = <R extends StaleCandidate>(
  pending: readonly R[],
  nextHead: string | null,
  at: Date,
): StaleMarking => ({
  ids: pending
    .filter((row) =>
      !row.staleAt &&
      row.id !== nextHead &&
      row.baseRevisionId !== nextHead
    )
    .map((row) => row.id),
  at,
});

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
  /** Set once the base stopped being head (§3.6). A stale row is not folded
   * onto — it is replaced, because nothing folded onto it could be approved. */
  staleAt: Date | null;
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
    /**
     * The pending row is stale (§3.6), so this batch starts a new proposal and
     * the old row goes. Not a squash: folding onto a base that is no longer
     * head only grows something approval must refuse. Not a plain create
     * either, because one pending row per document is a database fact — the
     * delete and the insert have to travel together.
     */
    kind: "replace";
    /** The stale row this supersedes. */
    replaces: string;
    /** A fresh proposal, based on what *this* batch read. */
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
  const fresh = (): ProposalRowState => ({
    data: batch.data,
    ops: [...batch.ops],
    origin: batch.origin,
    summary: batch.summary ?? null,
    // The one and only write of this column.
    baseRevisionId: batch.base,
    proposedAt: batch.at,
    createdAt: batch.at,
    version: 0,
  });

  if (!existing) return { kind: "create", row: fresh() };

  // The pending row was built on a base this batch is not standing on: either
  // it was stamped stale by a save (§3.6), or head moved between the stamp and
  // now. Folding would append this batch's work to a row approval can only
  // refuse, so the row is replaced by one based on what was actually read.
  // The ops do not carry over — they name a state that is no longer anywhere.
  if (isProposalStale(existing, batch.base)) {
    return { kind: "replace", replaces: existing.id, row: fresh() };
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

/**
 * What the reviewer decided, when they decided anything at all.
 *
 * Both fields are optional and an absent object is the whole-proposal approval
 * that existed before per-hunk review — one approve path, not two. A reviewer
 * who refused nothing is indistinguishable, on purpose, from a reviewer who was
 * never offered the choice.
 */
export interface ApprovalDecisions {
  /**
   * The ids of the hunks the author refused — `proposalDiff.ts`'s vocabulary.
   *
   * Ids only. The content behind them is **recomputed** from the two stored
   * states, never taken from the client: a hunk id is a pure function of
   * `(base, proposal)`, so the server can say what the author's selection meant
   * without trusting them for a single byte of document.
   */
  rejectedHunks?: readonly string[];
  /**
   * The `version` the reviewed hunks were computed from, if the reviewer said.
   *
   * A **third** fence, and it guards something neither of the other two can see.
   * `baseRevisionId` catches the author saving underneath (§3.4) and `version`
   * catches two agent batches racing each other (§3.2) — but an agent squashing
   * a further batch onto the proposal *while the review page is open* moves
   * neither `head` nor the base. The hunks on screen then describe a state the
   * row has moved past, and applying that selection would accept and refuse
   * blocks the author never saw. Supplying the version the hunks came from turns
   * that into a refusal the UI can answer by recomputing.
   *
   * Optional because the whole-proposal approval has nothing to pin: it accepts
   * the row as it stands, whatever batch that now includes.
   */
  version?: number;
}

export type ApprovalPlan =
  | {
    /** The base stopped being head, so the proposal's content is built on a
     * state that no longer exists. Refuse rather than rebase (§3.6). */
    kind: "stale";
  }
  | {
    /**
     * The row moved on since the reviewer computed their hunks — an agent
     * squashed another batch onto it (§3.2). Distinct from `stale`, and from
     * the head compare-and-set missing, because the answer is different: the
     * proposal is still approvable, the *selection* is what expired.
     */
    kind: "version-moved";
    /** What the row says now, so a caller can report the gap. */
    version: number;
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
    /**
     * The compare-and-set value for the *proposal row itself*.
     *
     * A different fence from `expectedHead`, and neither substitutes for the
     * other: head guards the document against the author's own save, this
     * guards the row against a batch landing between the read that produced the
     * merge and the write that stores it. Without it, a squash committed inside
     * that window would be silently promoted to head unreviewed — the plain
     * approval had this hole too, and closing it is not a second path but the
     * same one, guarded.
     */
    expectedVersion: number;
    /**
     * The hunks to leave out of the state that becomes head. Empty is the whole
     * proposal, and empty must reach storage as *today's* write — the row's
     * `data` untouched, not re-materialized into an equal-but-rewritten copy.
     */
    rejected: readonly string[];
    /** What turns the row into history. Everything else — `ops`, `origin`,
     * `baseRevisionId` — is kept as provenance (§3.3: approval keeps the ops). */
    patch: { proposedAt: null; staleAt: null };
  };

/**
 * Whether this proposal may be approved, and under which two compare-and-sets.
 *
 * Staleness is asked **first**. A stale proposal cannot be approved on any
 * version, so answering "your hunks are out of date" would send the reviewer to
 * recompute a selection over a row that could only ever refuse them.
 */
export const planApproval = (
  proposal: {
    baseRevisionId: string | null;
    staleAt: Date | null;
    version: number;
  },
  decisions: ApprovalDecisions = {},
): ApprovalPlan => {
  if (proposal.staleAt) return { kind: "stale" };
  if (
    decisions.version !== undefined && decisions.version !== proposal.version
  ) {
    return { kind: "version-moved", version: proposal.version };
  }
  return {
    kind: "approve",
    expectedHead: proposal.baseRevisionId,
    expectedVersion: proposal.version,
    rejected: decisions.rejectedHunks ?? [],
    patch: { proposedAt: null, staleAt: null },
  };
};

/**
 * The rail line for a proposal only part of which was taken.
 *
 * `ops` records what the agent proposed and is left exactly as written (§3.3);
 * the approved `data` records what was accepted. Neither says how much of the
 * one became the other, and a history row reading "Rewrote the introduction"
 * when two of its five changes were refused is a small lie the author has no
 * way to catch later. So the count is appended rather than the summary replaced
 * — the agent's own wording is still the useful half.
 *
 * A whole approval returns the summary untouched, which is what keeps the
 * absent-decisions path byte-identical to the one that predates review.
 */
export const noteApplied = (
  summary: string | null,
  applied: number,
  total: number,
): string | null => {
  if (applied === total) return summary;
  const note = `Applied ${applied} of ${total} proposed changes.`;
  return summary ? `${summary} — ${note}` : note;
};
