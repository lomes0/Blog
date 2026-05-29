import { DocumentType as PrismaDocumentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  Document,
  DocumentRevision,
  DocumentStatus,
  EditorDocument,
  EditorDocumentRevision,
} from "@/types";
import { validate } from "uuid";
import { README_DOCUMENT_NAME } from "@/constants";
import { getCachedRevision } from "./revision";

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

const revisionsSelect = {
  select: {
    id: true,
    documentId: true,
    createdAt: true,
    author: { select: revisionAuthorSelect },
  },
  orderBy: { createdAt: "desc" as const },
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
  sort_order: true,
  head: true,
  type: true,
  status: true,
  background_image: true,
  seriesId: true,
  seriesOrder: true,
} as const;

// Helper: map a raw prisma document row to a CloudDocument
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
): Document => {
  const revisions = post.collab
    ? post.revisions
    : post.revisions.filter((r) => r.id === post.head);
  return {
    ...post,
    coauthors: [],
    revisions: revisions as DocumentRevision[],
    type: PrismaDocumentType.DOCUMENT,
    head: post.head || "",
    status: post.status as DocumentStatus | undefined,
  } as unknown as Document;
};

// ─────────────────────────────────────────────────────────────────────────────

const findPublishedDocuments = async (limit?: number) => {
  const docs = await prisma.document.findMany({
    where: {
      published: true,
      type: PrismaDocumentType.DOCUMENT,
      NOT: { name: { equals: README_DOCUMENT_NAME, mode: "insensitive" } },
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

// Find all documents (published and unpublished)
const findAllDocuments = async (limit?: number) => {
  const docs = await prisma.document.findMany({
    where: {
      type: PrismaDocumentType.DOCUMENT,
      NOT: { name: { equals: README_DOCUMENT_NAME, mode: "insensitive" } },
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

  const cloudDoc: Document = {
    ...doc,
    coauthors: [], // Remove coauthor complexity
    type: PrismaDocumentType.DOCUMENT,
    head: doc.head || "",
    revisions: doc.revisions as DocumentRevision[],
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

const findDocumentsByAuthorId = async (authorId: string) => {
  const docs = await prisma.document.findMany({
    where: { authorId, type: PrismaDocumentType.DOCUMENT },
    select: {
      ...documentCoreSelect,
      revisions: revisionsSelect,
      author: { select: authorSelect },
    },
    orderBy: { createdAt: "desc" },
  });

  return docs.map(toCloudDocument);
};

const findPublishedDocumentsByAuthorId = async (authorId: string) => {
  const docs = await prisma.document.findMany({
    where: {
      authorId,
      published: true,
      type: PrismaDocumentType.DOCUMENT,
      NOT: { name: { equals: README_DOCUMENT_NAME, mode: "insensitive" } },
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

const createDocument = async (data: Prisma.DocumentUncheckedCreateInput) => {
  if (!data.id) return null;

  // Ensure it's always a DOCUMENT type, not DIRECTORY
  const docData = {
    ...data,
    type: PrismaDocumentType.DOCUMENT,
  };

  await prisma.document.create({ data: docData });
  return findDocument(data.id);
};

const updateDocument = async (
  handle: string,
  data: Prisma.DocumentUncheckedUpdateInput,
) => {
  // Ensure type remains DOCUMENT
  const docData = {
    ...data,
    type: PrismaDocumentType.DOCUMENT,
  };

  await prisma.document.update({
    where: validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
    data: docData,
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
      select: { id: true },
    });

    if (!doc) {
      throw new Error("Document not found");
    }

    // Delete the document
    return await tx.document.delete({
      where: { id: doc.id },
    });
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
        data: latestRevision.data as unknown as EditorDocumentRevision["data"],
      };
      // Update doc.head so the editorDocument below is consistent
      doc = { ...doc, head: latestRevision.id };
    }
  }

  if (!revision) return null;

  const editorDocument: EditorDocument = {
    ...doc,
    data: revision.data as unknown as EditorDocument["data"],
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

const findDocumentChildren = async (parentId: string) => {
  return prisma.document.findMany({
    where: { parentId },
    select: { id: true, name: true, sort_order: true },
    orderBy: [{ sort_order: "asc" }, { createdAt: "asc" }],
  });
};

export {
  createDocument,
  deleteDocument,
  findAllDocuments,
  findCloudStorageUsageByAuthorId,
  findDocument,
  findDocumentChildren,
  findDocumentsByAuthorId,
  findEditorDocument,
  findPublishedDocuments,
  findPublishedDocumentsByAuthorId,
  updateDocument,
};
