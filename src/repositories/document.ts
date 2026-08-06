import { DocumentType as PrismaDocumentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CloudPost,
  DocumentStatus,
  Post,
  Revision,
  RevisionMeta,
} from "@/types";
import { validate } from "uuid";
import { getCachedRevision } from "./revision";
import { rankForAppend, reRankIntoRoot } from "./ordering";

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
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  published: true,
  collab: true,
  private: true,
  baseId: true,
  parentId: true,
  rank: true,
  head: true,
  type: true,
  status: true,
  background_image: true,
  tabLabel: true,
  seriesId: true,
} as const;

// Helper: map a raw prisma document row to a CloudPost
const toCloudDocument = (
  post: Record<string, unknown> & {
    collab: boolean | null;
    head: string | null;
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
    : post.revisions.filter((r) => r.id === post.head);
  return {
    ...post,
    coauthors: [],
    revisions: revisions as RevisionMeta[],
    type: PrismaDocumentType.DOCUMENT,
    head: post.head || "",
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
      type: PrismaDocumentType.DOCUMENT,
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
        { type: PrismaDocumentType.DOCUMENT }, // Only regular documents, not directories
      ],
    },
    include: {
      revisions: {
        select: {
          id: true,
          documentId: true,
          createdAt: true,
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

  const cloudDoc: CloudPost = {
    ...doc,
    coauthors: [], // Remove coauthor complexity
    type: PrismaDocumentType.DOCUMENT,
    head: doc.head || "",
    revisions: doc.revisions as RevisionMeta[],
    status: doc.status as DocumentStatus,
  };

  if (revisions !== "all") {
    const revisionId = revisions ?? doc.head;
    let revision = revisionId
      ? cloudDoc.revisions.find((r) => r.id === revisionId)
      : undefined;

    if (!revision && !revisions) {
      // head is null or points to a revision not in the list — recover from latest
      revision = cloudDoc.revisions[0];
      if (!revision) return null;
      await prisma.document.update({
        where: { id: doc.id },
        data: { head: revision.id },
      });
      cloudDoc.head = revision.id;
    }

    if (!revision) return null;
    cloudDoc.revisions = [revision];
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
    where: { authorId, type: PrismaDocumentType.DOCUMENT },
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

const findPublishedDocumentsByAuthorId = async (authorId: string) => {
  const docs = await prisma.document.findMany({
    where: {
      authorId,
      published: true,
      type: PrismaDocumentType.DOCUMENT,
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

// `rank` is computed here (appended to the document's container), so callers
// need not supply it — though they may to pin an explicit position.
type CreateDocumentInput =
  & Omit<Prisma.DocumentUncheckedCreateInput, "rank">
  & { rank?: string | null };

const createDocument = async (data: CreateDocumentInput) => {
  if (!data.id) return null;

  // Position new documents at the end of their container (series / tab-group /
  // root) unless the caller already supplied a rank.
  const rank = data.rank ?? await rankForAppend(prisma, {
    authorId: data.authorId,
    seriesId: (data.seriesId as string | null | undefined) ?? null,
    parentId: (data.parentId as string | null | undefined) ?? null,
  });

  // Ensure it's always a DOCUMENT type, not DIRECTORY
  await prisma.document.create({
    data: { ...data, type: PrismaDocumentType.DOCUMENT, rank },
  });
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

const updateDocument = async (
  handle: string,
  data: Prisma.DocumentUncheckedUpdateInput,
  /**
   * Compare-and-set on `head`. `undefined` writes unconditionally — a rename or
   * a publish toggle is not racing anyone over content. Any other value,
   * including `null` for "this document has no revision yet", makes the whole
   * write conditional on the stored head still being that.
   */
  expectedHead?: string | null,
) => {
  // Ensure type remains DOCUMENT
  const docData = {
    ...data,
    type: PrismaDocumentType.DOCUMENT,
  };

  const where = validate(handle)
    ? { id: handle }
    : { handle: handle.toLowerCase() };

  if (expectedHead === undefined) {
    await prisma.document.update({ where, data: docData });
    return findDocument(handle, "all");
  }

  // `updateMany` is the only shape that can carry the guard, because `head` is
  // not a unique column and `update`'s `where` will not take it. It also takes
  // scalars only, so the nested relation writes are split off and replayed
  // afterwards on the row the guard has already locked.
  //
  // The order is what makes this a compare-and-set rather than a check followed
  // by a hope: Postgres holds a row lock from the moment the UPDATE matches, so
  // a writer arriving mid-transaction blocks and then re-evaluates `head`
  // against what we committed rather than against what it originally read.
  const { revisions, coauthors, ...scalars } = docData;

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.document.updateMany({
      where: { ...where, head: expectedHead },
      // The relation keys are gone; what is left is the scalar column set,
      // which `updateMany` accepts and the wider `Unchecked…Input` type does not
      // narrow to on its own.
      data: scalars as Prisma.DocumentUncheckedUpdateManyInput,
    });
    // Callers reach this having already proven the document exists (see
    // `requireDocument`), so a miss is a head mismatch rather than a 404.
    if (count === 0) throw new StaleHeadError(expectedHead);

    if (revisions || coauthors) {
      await tx.document.update({
        where,
        data: {
          ...(revisions !== undefined && { revisions }),
          ...(coauthors !== undefined && { coauthors }),
        },
      });
    }
  });

  return findDocument(handle, "all");
};

const deleteDocument = async (handle: string) => {
  // Find and delete in a single transaction to ensure consistency
  return await prisma.$transaction(async (tx) => {
    // Find the document
    const doc = await tx.document.findFirst({
      where: {
        AND: [
          validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
          { type: PrismaDocumentType.DOCUMENT },
        ],
      },
      select: { id: true, authorId: true },
    });

    if (!doc) {
      throw new Error("Post not found");
    }

    // Child tabs are promoted to root via onDelete: SetNull — capture them
    // (in order) so we can re-home them with fresh root ranks below.
    const children = await tx.document.findMany({
      where: { parentId: doc.id },
      orderBy: { rank: "asc" },
      select: { id: true },
    });

    const deleted = await tx.document.delete({
      where: { id: doc.id },
    });

    await reRankIntoRoot(tx, doc.authorId, children.map((c) => c.id));
    return deleted;
  });
};

const findEditorDocument = async (handle: string) => {
  let doc = await prisma.document.findFirst({
    where: {
      AND: [
        validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
        { type: PrismaDocumentType.DOCUMENT }, // Only regular documents, not directories
      ],
    },
  });

  if (!doc) return null;

  let revision = doc.head ? await getCachedRevision(doc.head) : null;

  if (!revision) {
    // Head is missing or points to a deleted revision — recover from latest
    const latestRevision = await prisma.revision.findFirst({
      where: { documentId: doc.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentId: true, createdAt: true, data: true },
    });
    if (latestRevision) {
      // Repair the document's head pointer
      await prisma.document.update({
        where: { id: doc.id },
        data: { head: latestRevision.id },
      });
      revision = {
        ...latestRevision,
        data: latestRevision.data as unknown as Revision["data"],
      };
      // Update doc.head so the editorDocument below is consistent
      doc = { ...doc, head: latestRevision.id };
    }
  }

  if (!revision) return null;

  const editorDocument: Post = {
    ...doc,
    data: revision.data as unknown as Post["data"],
    type: PrismaDocumentType.DOCUMENT,
    status: doc.status as DocumentStatus,
    head: doc.head || "",
  };

  return editorDocument;
};

// Find cloud storage usage by author ID (documents only)
const findCloudStorageUsageByAuthorId = async (authorId: string) => {
  const docSizes = await prisma.$queryRaw<
    { id: string; name: string; size: number }[]
  >`
    SELECT
      d.id,
      d.name,
      (pg_column_size(d.*) + SUM(pg_column_size(r.*)))::float AS size
    FROM
      "Document" d
    LEFT JOIN
      "Revision" r
    ON
      d.id = r."documentId"
    WHERE
      d."authorId" = ${authorId}::uuid
      AND d."type" = 'DOCUMENT'
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

const findDocumentChildren = async (parentId: string) => {
  return prisma.document.findMany({
    where: { parentId },
    select: { id: true, name: true, rank: true },
    orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
  });
};

export {
  createDocument,
  deleteDocument,
  findCloudStorageUsageByAuthorId,
  findDocument,
  findDocumentChildren,
  findDocumentsByAuthorId,
  findEditorDocument,
  findPublishedDocuments,
  findPublishedDocumentsByAuthorId,
  findUnownedDocumentIds,
  updateDocument,
};
