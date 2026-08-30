import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orderBy } from "@/lib/orderArray";
import {
  CloudPost,
  DocumentStatus,
  Post,
  Revision,
  RevisionMeta,
} from "@/types";
import { validate } from "uuid";
import { historyOf, selectHead } from "@/lib/proposals";
import { getCachedRevision, markProposalsStale } from "./revision";
import {
  addToOrder,
  containerOf,
  freeIntoRoot,
  removeFromOrder,
} from "./ordering";
import { APP_ORIGIN } from "@/lib/changes/events";
import { changeNotification, notifyChange } from "@/lib/changes/notify";

// ─── Shared select fragments ─────────────────────────────────────────────────

const authorSelect = {
  id: true,
  handle: true,
  name: true,
  image: true,
  email: true,
} as const;

const revisionAuthorSelect = {
  id: true,
  handle: true,
  name: true,
  image: true,
  email: true,
} as const;

/**
 * Revision metadata for *list* queries — the newest revision only.
 *
 * Without the `take` this fetches every revision of every document and
 * `toCloudDocument` then discards all but `head`, so the cost of a list grew
 * with how much its author had ever typed. One row per document is all a list
 * view needs; full history comes from `findDocument(id, "all")`.
 *
 * `take: 1` is the newest revision, which is `head` for every document that
 * isn't collaboratively edited — the same row the non-collab branch of
 * `toCloudDocument` keeps. A collab document's list entry is now its newest
 * revision rather than its whole history; the detail route still returns all of
 * it, and `applyPost` will not let this shorter list overwrite one already
 * loaded there.
 */
const revisionsSelect = {
  // The history filter, and it lives **here** rather than in
  // `toCloudDocument`'s non-collab arm (docs/plans/archive/agent-gating.md §2.1). In
  // the arm it would be wrong twice over: the non-collab arm already keeps only
  // `head`, so with `take: 1` the one row fetched *is* the proposal and the
  // document arrives with no revision metadata at all — and the `collab` arm
  // filters nothing, so a proposal would reach the client dressed as history.
  // Filtering in the query fixes both, for every caller, in one place.
  where: { proposedAt: null },
  select: {
    id: true,
    documentId: true,
    createdAt: true,
    author: { select: revisionAuthorSelect },
  },
  orderBy: { createdAt: "desc" as const },
  take: 1,
};

const documentCoreSelect = {
  id: true,
  handle: true,
  title: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  published: true,
  collab: true,
  private: true,
  baseId: true,
  parentId: true,
  // The order of this post's child tabs, for the client's tab strips
  // (docs/plans/archive/ordering-simplification.md §2). Empty for the posts
  // that have no tabs, which is most of them.
  tabOrder: true,
  headRevisionId: true,
  status: true,
  tabLabel: true,
  seriesId: true,
} as const;

// Helper: map a raw prisma document row to a CloudPost
const toCloudDocument = (
  post: Record<string, unknown> & {
    collab: boolean | null;
    headRevisionId: string | null;
    status: string | null;
    revisions: {
      id: string;
      documentId: string;
      createdAt: Date;
      author: {
        id: string;
        handle: string | null;
        name: string | null;
        image: string | null;
        email: string | null;
      };
    }[];
  },
): CloudPost => {
  const revisions = post.collab
    ? post.revisions
    : post.revisions.filter((r) => r.id === post.headRevisionId);
  return {
    ...post,
    coauthors: [],
    revisions: revisions as RevisionMeta[],
    headRevisionId: post.headRevisionId || "",
    status: post.status as DocumentStatus | undefined,
  } as unknown as CloudPost;
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Documents anyone may see: published, and not marked private.
 *
 * This is the only listing that should back a public surface — the landing
 * page, the sitemap. Both `published` and `private` are checked because they
 * are independent flags, so a post can be published *and* private and must
 * still stay out of a public list.
 *
 * There used to be a `findAllDocuments` beside this that filtered on neither,
 * and it was what the landing page, the sitemap and the anonymous branch of
 * `GET /api/documents` all actually called. It has been removed rather than
 * left for someone to reach for again.
 */
const findPublishedDocuments = async (limit?: number) => {
  const docs = await prisma.document.findMany({
    where: {
      published: true,
      private: false,
    },
    select: {
      ...documentCoreSelect,
      revisions: revisionsSelect,
      author: { select: authorSelect },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return docs.map(toCloudDocument);
};

const findDocument = async (
  handle: string,
  revisions?: "all" | string | null,
) => {
  const doc = await prisma.document.findFirst({
    where: {
      AND: [
        validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
      ],
    },
    include: {
      revisions: {
        // Unfiltered, unlike `revisionsSelect` — and `proposedAt` is selected —
        // because the head repair below has to *know about* proposals in order
        // to skip them. Proposals are dropped from what leaves this function a
        // few lines down (`historyOf`), so no caller sees one.
        select: {
          id: true,
          documentId: true,
          createdAt: true,
          proposedAt: true,
          author: {
            select: {
              id: true,
              handle: true,
              name: true,
              image: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
      author: {
        select: {
          id: true,
          handle: true,
          name: true,
          image: true,
          email: true,
        },
      },
      // Remove coauthors for simple blog structure
    },
  });

  if (!doc) {
    return null;
  }

  // `proposedAt` is an implementation detail of the repair; nothing above this
  // repository has a use for it.
  const asMeta = (
    { proposedAt: _proposedAt, ...meta }: typeof doc.revisions[0],
  ) => meta as RevisionMeta;
  const history = historyOf(doc.revisions);

  const cloudDoc: CloudPost = {
    ...doc,
    coauthors: [], // Remove coauthor complexity
    headRevisionId: doc.headRevisionId || "",
    revisions: history.map(asMeta),
    status: doc.status as DocumentStatus,
  };

  if (revisions !== "all") {
    // A pinned revision id resolves against history only: a pending proposal is
    // not a state this document may be shown at.
    let revision = revisions
      ? history.find((r) => r.id === revisions)
      : undefined;

    if (!revisions) {
      const selection = selectHead(doc.revisions, doc.headRevisionId);
      revision = selection.revision ?? undefined;

      if (!revision) {
        // head is null, points at a revision not in the list, or names a
        // pending proposal — recover from the newest row that is *not* a
        // proposal. `DELETE /api/revisions/[id]` lets a revision's author
        // delete head's own row without touching `head`, so this repair runs on
        // an ordinary read; promoting the newest row full stop would make an
        // unreviewed agent write the document with no user action and no
        // compare-and-set (docs/plans/archive/agent-gating.md §2.1).
        if (!selection.repair) return null;
        revision = selection.repair;
        const repaired = revision.id;
        // A repair is a head move like any other, so it can strand a pending
        // proposal — the base it was built on is the row that went missing.
        // Marking makes that a stated "out of date" rather than a 409 the
        // author only meets after clicking Approve (§3.6).
        await prisma.$transaction(async (tx) => {
          await tx.document.update({
            where: { id: doc.id },
            data: { headRevisionId: repaired },
          });
          await markProposalsStale(tx, { id: doc.id }, repaired);
        });
        cloudDoc.headRevisionId = repaired;
      }
    }

    if (!revision) return null;
    cloudDoc.revisions = [asMeta(revision)];
    cloudDoc.updatedAt = revision.createdAt;
  }

  return cloudDoc;
};

/** Largest page a caller may request, and the size used when none is given. */
export const AUTHOR_DOCUMENTS_PAGE_SIZE = 100;

/**
 * One page of the author's posts, newest first.
 *
 * Keyset pagination rather than `skip`/`take`: the sort is
 * `(createdAt desc, id desc)` so the order is total — `createdAt` alone is not
 * unique and would let rows repeat or vanish across page boundaries — and the
 * cursor is the last row's id. `nextCursor` is null on the final page.
 *
 * The unbounded version of this query was the app's worst read: it scanned
 * every document an author had ever written and joined in every revision of
 * each. Callers that still want the whole list should page through it (see
 * `cloudBackend.list`) rather than ask for it in one statement.
 */
const findDocumentsByAuthorId = async (
  authorId: string,
  options: { cursor?: string; take?: number } = {},
) => {
  const take = Math.min(
    Math.max(options.take ?? AUTHOR_DOCUMENTS_PAGE_SIZE, 1),
    AUTHOR_DOCUMENTS_PAGE_SIZE,
  );
  const docs = await prisma.document.findMany({
    where: { authorId },
    select: {
      ...documentCoreSelect,
      revisions: revisionsSelect,
      author: { select: authorSelect },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    // One extra row is a cheaper "is there more?" than a second count query.
    take: take + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });

  const hasMore = docs.length > take;
  const page = hasMore ? docs.slice(0, take) : docs;
  return {
    documents: page.map(toCloudDocument),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
};

/**
 * Every document the author owns, as `{ id, updatedAt }` and nothing else.
 *
 * This backs `GET /api/documents/changes` — the catch-up query of
 * docs/plans/archive/changes-detection.md §3. The client diffs it against its store to
 * learn what was created, updated and (§3.1) deleted while it was not looking.
 *
 * **Deliberately unpaged.** `AUTHOR_DOCUMENTS_PAGE_SIZE` caps the *listing*
 * because that query joins revision metadata and returns whole documents; this
 * one is two columns off the author's own index and no document bodies —
 * hundreds of rows for a personal blog, and paging it would defeat the point,
 * since a delete is only detectable as an id missing from the **full** set.
 * Revisit if the document count makes the response large enough to notice.
 *
 * **`updatedAt` is the document row's own, and that is what the store holds.**
 * Worth stating because it is easy to assume otherwise: `findDocument` does
 * overwrite `updatedAt` with a revision's `createdAt`, but only on its
 * single-revision branch, and `cloudBackend.get` overwrites it straight back
 * with `findEditorDocument`'s (the document row's). The list path
 * (`toCloudDocument`) never touches it at all. So both paths that populate the
 * store agree with this query, and the diff does not produce false positives.
 *
 * Which also answers the question §3.2 raises: **a pending proposal does not
 * move this timestamp.** `Document.updatedAt` is Prisma `@updatedAt`, so only a
 * write to the *document* row bumps it, and `upsertProposal` writes `Revision`
 * rows only. (Even on the branch where a revision's `createdAt` is used,
 * `revisionsSelect` and `historyOf` both filter `proposedAt: null`, so a
 * proposal could not surface there either.) §3.2 therefore stands unchanged and
 * the reconcile must keep dispatching `refreshProposals()` alongside this — it
 * is the only thing that can see an `apply_ops` that landed while the client
 * was disconnected.
 */
const findDocumentIdsByAuthorId = async (authorId: string) =>
  await prisma.document.findMany({
    where: { authorId },
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

const findPublishedDocumentsByAuthorId = async (authorId: string) => {
  const docs = await prisma.document.findMany({
    where: {
      authorId,
      published: true,
    },
    select: {
      ...documentCoreSelect,
      revisions: revisionsSelect,
      author: { select: authorSelect },
    },
    orderBy: { createdAt: "desc" },
  });

  return docs.map(toCloudDocument);
};

// Where in its container the new document lands: `placement` says which end,
// and the container's order array is what records it
// (docs/plans/archive/ordering-simplification.md §6, "Create"). There is no
// position on the row itself any more.
type CreateDocumentInput =
  & Omit<Prisma.DocumentUncheckedCreateInput, "headRevisionId">
  & {
    placement?: DocumentPlacement;
    /**
     * The revision this document is born pointing at — created alongside it, by
     * the nested `revisions.create` in the same input.
     *
     * Separate from the rest of the column set because it cannot be written in
     * the same statement as the row (docs/plans/schema-organization.md §B):
     * `headRevisionId` is a foreign key, and the revision it names is inserted
     * *by* this create, so the pointer is a second statement inside the same
     * transaction. Passing it through `data` would only produce a foreign-key
     * violation, which is why the type no longer admits it.
     */
    headRevisionId?: string | null;
  };

/** Which end of its container a new document lands at. Default `"end"`. */
export type DocumentPlacement = "start" | "end";

const createDocument = async (
  { placement = "end", headRevisionId, ...data }: CreateDocumentInput,
) => {
  if (!data.id) return null;

  // Which container the new document is born into (series / tab-group / root);
  // its order array is updated once the row commits, below.
  const container = {
    authorId: data.authorId,
    seriesId: (data.seriesId as string | null | undefined) ?? null,
    parentId: (data.parentId as string | null | undefined) ?? null,
  };

  const create = prisma.document.create({
    data,
  });

  // The create and its notification commit together (docs/plans/
  // changes-detection.md §2.1): Postgres delivers a `NOTIFY` at COMMIT and
  // discards it on rollback, so a create that fails cannot announce a post that
  // does not exist. The ids are known before the write here, which is what lets
  // this one be the array form the plan sketches.
  const notification = changeNotification({
    kind: "document.created",
    id: data.id,
    authorId: data.authorId,
    origin: APP_ORIGIN,
  });
  const statements: Prisma.PrismaPromise<unknown>[] = [create];
  // Second, and only after the nested `revisions.create` above has put the row
  // there: the pointer is a foreign key now, so a document cannot be born
  // naming a revision that does not exist yet. Same transaction, so a post
  // still never commits without its head — the two writes are ordered, not
  // separable, which is the answer to §5's third open decision. A create that
  // fails at either statement leaves nothing behind.
  if (headRevisionId) {
    statements.push(prisma.document.update({
      where: { id: data.id },
      data: { headRevisionId },
    }));
  }
  if (notification) statements.push(notification);
  await prisma.$transaction(statements);

  // The container's order array gains the new id
  // (docs/plans/archive/ordering-simplification.md §6, "Create"). This is the
  // whole of where the post lands: `placement: "start"` is the case that needs
  // it, since without an entry the tolerant reader shows a new row *last*,
  // which is right for an append and wrong for a prepend.
  await addToOrder(
    prisma,
    containerOf(container),
    [data.id],
    placement === "start" ? "start" : "end",
  );

  return findDocument(data.id);
};

/**
 * A conditional update lost the race: `head` was not what the caller expected.
 *
 * Carried as its own class so the route can answer 409 rather than 500, and so
 * that "someone else saved first" is never mistaken for a bug.
 */
export class StaleHeadError extends Error {
  constructor(readonly expected: string | null) {
    super("Document head is no longer the one this write was based on");
    this.name = "StaleHeadError";
  }
}

/**
 * The literal value a write is setting `headRevisionId` to, or `undefined` when
 * it is not setting one at all — a rename, a publish toggle, a move.
 *
 * Prisma's update input admits both `headRevisionId: "…"` and
 * `headRevisionId: { set: "…" }`, and the difference matters here only because
 * getting it wrong would silently skip the stale marking on a save. Both shapes
 * are read rather than one assumed.
 */
const literalHead = (
  head: Prisma.DocumentUncheckedUpdateInput["headRevisionId"],
): string | null | undefined => {
  if (head === undefined || head === null || typeof head === "string") {
    return head;
  }
  return "set" in head ? head.set ?? null : undefined;
};

/**
 * Re-read the document an update just wrote, and announce it on the change feed.
 *
 * The one emit site in this file that is **not** inside the write's transaction,
 * and deliberately: `updateDocument` is addressed by *handle*, and two of its
 * three arms are `updateMany` (the compare-and-set needs a `where` on `head`,
 * which `update` will not take), which returns a count and no row. So the
 * document's id and its author's are only knowable from the read this function
 * already performs afterwards — emitting inside the transaction would mean
 * adding a query to every save purely to fill in a payload.
 *
 * What that costs is one event if the process dies between COMMIT and this
 * statement. That is the exact failure §3's catch-up exists to repair, and it
 * is a far better trade than a round trip per save.
 */
const announceUpdate = async (handle: string) => {
  const doc = await findDocument(handle, "all");
  if (doc) {
    await notifyChange(prisma, {
      kind: "document.updated",
      id: doc.id,
      authorId: doc.author.id,
      origin: APP_ORIGIN,
    });
  }
  return doc;
};

const updateDocument = async (
  handle: string,
  data: Prisma.DocumentUncheckedUpdateInput,
  /**
   * Compare-and-set on `headRevisionId`. `undefined` writes unconditionally — a
   * rename or a publish toggle is not racing anyone over content. Any other
   * value, including `null` for "this document has no revision yet", makes the
   * whole write conditional on the stored head still being that.
   */
  expectedHead?: string | null,
) => {
  const where = validate(handle)
    ? { id: handle }
    : { handle: handle.toLowerCase() };

  // A save moves `headRevisionId`, and a proposal built on the head it moves off
  // can no longer be approved (docs/plans/archive/agent-gating.md §3.6). Marking
  // travels with the move, in whichever transaction the move is happening in —
  // the two must not be separable, or a crash between them leaves the rail
  // offering an Approve button that can only 409, with nothing left to come back
  // and fix it.
  const nextHead = literalHead(data.headRevisionId);

  // Split unconditionally, because the *order* of the two halves is now load
  // bearing rather than a detail of how the guard is spelled
  // (docs/plans/schema-organization.md §B). `headRevisionId` is a foreign key,
  // so the revision a save is pointing at has to exist before the pointer is
  // written — and a save arrives here as exactly that pair: a nested
  // `revisions.connectOrCreate` and a scalar `headRevisionId` naming the row it
  // creates. Leaving both in one `update` would put the ordering in Prisma's
  // hands; leaving the scalars first, as the compare-and-set arm used to, gets
  // it wrong outright. Relations first, then the scalars, on every path.
  //
  // Rolling back is what makes this safe to do before the guard: a revision
  // written for a save that then loses the compare-and-set goes away with the
  // transaction.
  const { revisions, coauthors, ...scalars } = data;
  const writeRelations = async (tx: Prisma.TransactionClient) => {
    if (revisions === undefined && coauthors === undefined) return;
    await tx.document.update({
      where,
      data: {
        ...(revisions !== undefined && { revisions }),
        ...(coauthors !== undefined && { coauthors }),
      },
    });
  };

  if (expectedHead === undefined) {
    if (nextHead === undefined && revisions === undefined &&
      coauthors === undefined
    ) {
      await prisma.document.update({ where, data });
      return announceUpdate(handle);
    }
    await prisma.$transaction(async (tx) => {
      await writeRelations(tx);
      await tx.document.update({ where, data: scalars });
      if (nextHead !== undefined) {
        await markProposalsStale(tx, where, nextHead);
      }
    });
    return announceUpdate(handle);
  }

  // `updateMany` is the only shape that can carry the guard, because
  // `headRevisionId` is not a unique column and `update`'s `where` will not take
  // it. It also takes scalars only, which is the second reason the relation
  // writes are split off above.
  //
  // The order is what makes this a compare-and-set rather than a check followed
  // by a hope: Postgres holds a row lock from the moment the UPDATE matches, so
  // a writer arriving mid-transaction blocks and then re-evaluates the head
  // against what we committed rather than against what it originally read.
  await prisma.$transaction(async (tx) => {
    await writeRelations(tx);

    const { count } = await tx.document.updateMany({
      where: { ...where, headRevisionId: expectedHead },
      // The relation keys are gone; what is left is the scalar column set,
      // which `updateMany` accepts and the wider `Unchecked…Input` type does not
      // narrow to on its own.
      data: scalars as Prisma.DocumentUncheckedUpdateManyInput,
    });
    // Callers reach this having already proven the document exists (see
    // `requireDocument`), so a miss is a head mismatch rather than a 404.
    if (count === 0) throw new StaleHeadError(expectedHead);

    if (nextHead !== undefined) {
      await markProposalsStale(tx, where, nextHead);
    }
  });

  return announceUpdate(handle);
};

/**
 * A parent's child-tab ids in the parent's own `tabOrder`, with anything the
 * array has not heard of appended (the tolerant reader's rule, §6). The delete
 * path needs it because the order is the container's array, not a column SQL
 * could sort the children by.
 */
const orderedChildIds = async (
  tx: Prisma.TransactionClient,
  parentId: string,
): Promise<string[]> => {
  const [parent, children] = await Promise.all([
    tx.document.findUnique({
      where: { id: parentId },
      select: { tabOrder: true },
    }),
    tx.document.findMany({
      where: { parentId },
      select: { id: true, createdAt: true },
    }),
  ]);
  return orderBy(parent?.tabOrder ?? [], children).map((child) => child.id);
};

/**
 * Delete one already-located document, inside the caller's transaction.
 *
 * Split out because the delete has a second entry point (`discardAgentDocument`)
 * that differs only in how the row is found — and the part worth not
 * duplicating is what happens *after* the delete: child tabs are promoted to
 * root by `onDelete: SetNull`, which does nothing about the root list they land
 * in, so they have to be appended to it here.
 *
 * It is also the single emit site for `document.deleted`, which is what makes it
 * cover `deleteDocument` and `discardAgentDocument` at once — and the notify goes
 * *inside* the caller's transaction, so a delete that rolls back cannot announce
 * the removal of a post that is still there.
 */
const deleteDocumentRow = async (
  tx: Prisma.TransactionClient,
  doc: { id: string; authorId: string },
  /**
   * Who is doing the deleting, for the change feed. Defaults to the app,
   * because that is every caller but the MCP server's `delete_post` — and a
   * client tells an agent's removal from its own by this field alone
   * (`isAgentOrigin`), so a terminal deleting a post must not look like the
   * author deleting it in another tab.
   */
  origin: string = APP_ORIGIN,
) => {
  // Child tabs are promoted to root via onDelete: SetNull — capture them, in
  // the order the parent held them in, so they arrive at root in that order.
  const children = await orderedChildIds(tx, doc.id);

  const deleted = await tx.document.delete({
    where: { id: doc.id },
  });

  await freeIntoRoot(tx, doc.authorId, children);

  // The container it was in loses the id. The tolerant reader already ignores
  // an id with no row (docs/plans/archive/ordering-simplification.md §6), so
  // this is hygiene rather than correctness — but leaving deleted ids to
  // accumulate would make every array a growing record of what used to be
  // there.
  await removeFromOrder(tx, containerOf(deleted), [doc.id]);

  await notifyChange(tx, {
    kind: "document.deleted",
    id: doc.id,
    authorId: doc.authorId,
    origin,
  });
  // The promoted children moved container, and nothing else will say so: their
  // rows survive, so a client that only heard about the delete would keep
  // rendering them as tabs of a post that no longer exists until the next poll.
  // Usually an empty list.
  for (const childId of children) {
    await notifyChange(tx, {
      kind: "document.updated",
      id: childId,
      authorId: doc.authorId,
      origin,
    });
  }

  return deleted;
};

const deleteDocument = async (handle: string) => {
  // Find and delete in a single transaction to ensure consistency
  return await prisma.$transaction(async (tx) => {
    // Find the document
    const doc = await tx.document.findFirst({
      where: {
        AND: [
          validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
        ],
      },
      select: { id: true, authorId: true },
    });

    if (!doc) {
      throw new Error("Post not found");
    }

    return deleteDocumentRow(tx, doc);
  });
};

const findEditorDocument = async (handle: string) => {
  let doc = await prisma.document.findFirst({
    where: {
      AND: [
        validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
      ],
    },
  });

  if (!doc) return null;

  let revision = doc.headRevisionId ? await getCachedRevision(doc.headRevisionId) : null;
  // A `head` naming a pending proposal is a broken state rather than an
  // impossible one — nothing constrains the pointer — and serving it would put
  // an unapproved agent write in the editor. Treat it as missing and repair.
  if (revision?.proposedAt) revision = null;

  if (!revision) {
    // Head is missing or points to a deleted revision — recover from the latest
    // row that is *not* a proposal. Same rule, and same reason, as the repair in
    // `findDocument` (docs/plans/archive/agent-gating.md §2.1).
    const latestRevision = await prisma.revision.findFirst({
      where: { documentId: doc.id, proposedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentId: true, createdAt: true, data: true },
    });
    if (latestRevision) {
      // `doc` is reassigned below, so its id is captured here: inside the
      // callback TypeScript can no longer prove it is the row we just found.
      const docId = doc.id;
      // Repair the document's head pointer — and stale-mark whatever was built
      // on the head it is replacing, for the same reason as in `findDocument`.
      await prisma.$transaction(async (tx) => {
        await tx.document.update({
          where: { id: docId },
          data: { headRevisionId: latestRevision.id },
        });
        await markProposalsStale(tx, { id: docId }, latestRevision.id);
      });
      revision = {
        ...latestRevision,
        proposedAt: null, // guaranteed by the query above
        data: latestRevision.data as unknown as Revision["data"],
      };
      // Update doc.head so the editorDocument below is consistent
      doc = { ...doc, headRevisionId: latestRevision.id };
    }
  }

  if (!revision) return null;

  const editorDocument: Post = {
    ...doc,
    data: revision.data as unknown as Post["data"],
    status: doc.status as DocumentStatus,
    headRevisionId: doc.headRevisionId || "",
  };

  return editorDocument;
};

// Find cloud storage usage by author ID (documents only).
//
// The `d.title AS name` below is an alias, not a leftover:
// `DocumentStorageUsage.name` is a label on a chart rather than the post model,
// so it kept its own word when the column became `title`
// (docs/plans/schema-organization.md §C). The guest half of the same reading,
// `fetchStorageUsage`, maps it identically.
const findCloudStorageUsageByAuthorId = async (authorId: string) => {
  const docSizes = await prisma.$queryRaw<
    { id: string; name: string; size: number }[]
  >`
    SELECT
      d.id,
      d.title AS name,
      (pg_column_size(d.*) + SUM(pg_column_size(r.*)))::float AS size
    FROM
      "Document" d
    LEFT JOIN
      "Revision" r
    ON
      d.id = r."documentId"
    WHERE
      d."authorId" = ${authorId}::uuid
    GROUP BY
      d.id
    ORDER BY
      d."createdAt" DESC;
  `;

  return docSizes;
};

/**
 * Which of `ids` the given author does *not* own (including ids that match no
 * document at all).
 *
 * Membership routes take a list of post ids and act on all of them, so checking
 * ownership one-at-a-time in the route invites checking only the first. One
 * query answers for the whole batch, and an empty result is the only thing a
 * caller should proceed on.
 */
const findUnownedDocumentIds = async (
  ids: string[],
  authorId: string,
): Promise<string[]> => {
  if (ids.length === 0) return [];
  const owned = await prisma.document.findMany({
    where: { id: { in: ids }, authorId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((d) => d.id));
  return ids.filter((id) => !ownedIds.has(id));
};

/**
 * A tabbed post's child tabs, in the parent's own `tabOrder`
 * (docs/plans/archive/ordering-simplification.md §3).
 *
 * `createdAt` is selected but not returned: it is the tiebreaker the tolerant
 * reader uses for a child the array has not heard of yet (§6).
 */
const findDocumentChildren = async (parentId: string) => {
  const [parent, children] = await Promise.all([
    prisma.document.findUnique({
      where: { id: parentId },
      select: { tabOrder: true },
    }),
    prisma.document.findMany({
      where: { parentId },
      select: { id: true, title: true, createdAt: true },
    }),
  ]);
  return orderBy(parent?.tabOrder ?? [], children).map(
    ({ createdAt: _createdAt, ...child }) => child,
  );
};

// ─── Agent-created posts (docs/plans/archive/agent-gating.md §3.7) ───────────────────

/**
 * How many of this author's posts are still flagged as agent-created.
 *
 * Half of the §3.5 focus poll — the badge covers pending proposals *and* posts
 * awaiting accept, because from the author's side they are the same question:
 * how much of Claude's work is waiting on me.
 */
const countAgentCreatedDocuments = async (authorId: string) =>
  prisma.document.count({
    where: {
      authorId,
      agentCreatedAt: { not: null },
    },
  });

/**
 * This author's agent-created posts, newest first — the other half of the rail.
 *
 * Metadata only, and deliberately not routed through `findDocumentsByAuthorId`:
 * that returns whole `CloudPost`s with revision metadata attached, and the rail
 * needs a name and a timestamp. The flag itself is the filter, so an accepted
 * post drops out of the listing the moment `acceptAgentDocument` clears it.
 */
const findAgentCreatedDocuments = async (authorId: string) =>
  prisma.document.findMany({
    where: {
      authorId,
      agentCreatedAt: { not: null },
    },
    select: {
      id: true,
      title: true,
      handle: true,
      agentCreatedAt: true,
      agentOrigin: true,
    },
    orderBy: { agentCreatedAt: "desc" },
  });

/**
 * Accept an agent-created post: clear the flag, keep the post.
 *
 * Guarded rather than unconditional, so the answer distinguishes "accepted" from
 * "there was nothing to accept" — which is what lets the route be idempotent
 * without pretending a second click did something. It writes no other column:
 * accepting is not publishing (§3.7), and a flagged post is an ordinary
 * unpublished draft in every other respect.
 *
 * `authorId` is a parameter rather than something this function looks up. The
 * guarded `updateMany` returns a count and no row, so filling in the change
 * feed's payload from here would mean a second query on a write that needs
 * none — and the caller has the answer already: the route reaches this having
 * passed `requireDocument(id, user, "own")`, which is precisely the proof that
 * the signed-in user *is* the document's author. Getting it wrong would fan the
 * event out to the wrong subscriber (§2.3), so it is taken from the authorized
 * document rather than from anything in the request.
 *
 * @returns true if a flag was cleared, false if the post was not flagged.
 */
const acceptAgentDocument = async (id: string, authorId: string) => {
  const { count } = await prisma.document.updateMany({
    where: { id, agentCreatedAt: { not: null } },
    data: { agentCreatedAt: null, agentOrigin: null },
  });
  if (count === 0) return false;

  // Post-commit for the same reason as `announceUpdate`: `updateMany` reports a
  // count, not a row. A lost event here is repaired by §3's catch-up.
  await notifyChange(prisma, {
    kind: "document.updated",
    id,
    authorId,
    origin: APP_ORIGIN,
  });
  return true;
};

/**
 * Discard an agent-created post: delete it, but *only* if it is still flagged.
 *
 * The guard is inside the transaction with the delete rather than a read in the
 * route, so accepting a post and discarding it cannot interleave into "accepted,
 * then deleted anyway". It is also what keeps this narrower than
 * `DELETE /api/documents/[id]`: a discard button wired to the wrong id cannot
 * remove a post you wrote.
 *
 * @returns true if the post was deleted, false if it was not agent-created (or
 *          does not exist).
 */
const discardAgentDocument = async (id: string) =>
  prisma.$transaction(async (tx) => {
    const doc = await tx.document.findFirst({
      where: {
        id,
        agentCreatedAt: { not: null },
      },
      select: { id: true, authorId: true },
    });
    if (!doc) return false;

    await deleteDocumentRow(tx, doc);
    return true;
  });

/**
 * Rename one of *this author's* posts, by id.
 *
 * Separate from `updateDocument` for the reason `discardAgentDocument` is
 * separate from `deleteDocument`: that one takes a handle and no author, and is
 * safe only because every route in front of it has already been through
 * `requireDocument`. The MCP server has no session to authorize against — its
 * whole authorization is the author it resolved — so the filter has to be *in*
 * the query, where forgetting it is impossible rather than merely unlikely.
 *
 * Only `title`. Not the handle (it is a URL, and changing it breaks links), not
 * `published` (a publish is a decision, not a rename), and not the container
 * fields, which belong to the move routes.
 *
 * No compare-and-set on `headRevisionId`: a rename does not touch content, so it
 * cannot race a save and cannot invalidate a pending proposal.
 */
const renameOwnedDocument = async (
  { id, ownedBy, title, origin = APP_ORIGIN }: {
    id: string;
    ownedBy: string;
    title: string;
    origin?: string;
  },
): Promise<
  { ok: true; previousTitle: string } | { ok: false; reason: "not-found" }
> =>
  prisma.$transaction(async (tx) => {
    const doc = await tx.document.findFirst({
      where: { id, authorId: ownedBy },
      select: { id: true, title: true },
    });
    if (!doc) return { ok: false as const, reason: "not-found" as const };

    await tx.document.update({ where: { id: doc.id }, data: { title } });
    await notifyChange(tx, {
      kind: "document.updated",
      id: doc.id,
      authorId: ownedBy,
      origin,
    });
    return { ok: true as const, previousTitle: doc.title };
  });

/**
 * Delete one of *this author's* posts, by id, after confirming its title.
 *
 * The confirmation is not ceremony. There is no `deletedAt` on `Document` and
 * no trash table: this cascades the post's revisions and its whole history, and
 * nothing can put it back. The realistic failure is not an agent deciding to be
 * destructive, it is an agent reading a list and acting on the neighbouring id —
 * so the caller has to name what it believes it is deleting, and a mismatch
 * refuses. Passing no `confirmName` never deletes; it reports what would be
 * destroyed, which is how the tool gets a title to echo back.
 *
 * Find, compare and delete are one transaction for the same reason they are in
 * `discardAgentDocument`: a rename landing between the check and the delete
 * must not turn into "confirmed one post, deleted another".
 */
const deleteOwnedDocument = async (
  { id, ownedBy, confirmName, origin = APP_ORIGIN }: {
    id: string;
    ownedBy: string;
    confirmName?: string;
    origin?: string;
  },
): Promise<
  | { ok: true; name: string }
  | { ok: false; reason: "not-found" }
  | {
    ok: false;
    reason: "unconfirmed";
    name: string;
    revisions: number;
    published: boolean;
  }
> =>
  prisma.$transaction(async (tx) => {
    const doc = await tx.document.findFirst({
      where: { id, authorId: ownedBy },
      select: {
        id: true,
        title: true,
        authorId: true,
        published: true,
        _count: { select: { revisions: true } },
      },
    });
    if (!doc) return { ok: false as const, reason: "not-found" as const };

    // Trimmed, but not case-folded: this is a copy of a title the caller was
    // just shown, so tolerating stray whitespace is kindness and tolerating a
    // different capitalisation would be tolerating a different post.
    if (confirmName === undefined || confirmName.trim() !== doc.title.trim()) {
      return {
        ok: false as const,
        reason: "unconfirmed" as const,
        name: doc.title,
        revisions: doc._count.revisions,
        published: doc.published,
      };
    }

    await deleteDocumentRow(tx, doc, origin);
    return { ok: true as const, name: doc.title };
  });

export {
  acceptAgentDocument,
  countAgentCreatedDocuments,
  createDocument,
  deleteDocument,
  deleteOwnedDocument,
  discardAgentDocument,
  findAgentCreatedDocuments,
  findCloudStorageUsageByAuthorId,
  findDocument,
  findDocumentChildren,
  findDocumentIdsByAuthorId,
  findDocumentsByAuthorId,
  findEditorDocument,
  findPublishedDocuments,
  findPublishedDocumentsByAuthorId,
  findUnownedDocumentIds,
  renameOwnedDocument,
  updateDocument,
};
