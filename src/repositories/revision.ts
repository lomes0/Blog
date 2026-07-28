import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Revision } from "@/types";
import { unstable_cache } from "next/cache";

const findRevisionById = async (id: string) => {
  const revision = await prisma.revision.findUnique({
    where: { id },
    select: {
      id: true,
      documentId: true,
      createdAt: true,
      data: true,
    },
  });
  if (!revision) return null;
  const RevisionMeta: Revision = {
    ...revision,
    data: revision.data as unknown as Revision["data"],
  };
  return RevisionMeta as Revision;
};

const getCachedRevision = unstable_cache(findRevisionById, [], {
  tags: ["revision"],
});

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

/**
 * Create a revision, or rewrite one already open under the same id.
 *
 * The editor folds a stretch of autosaves into a single revision (see
 * `useSave`), so re-posting a known id means "this revision's content moved on"
 * rather than "duplicate, ignore me" — the update has to be real. Only `data`
 * and `createdAt` move; the row keeps its document and author.
 *
 * Callers are responsible for checking that the id belongs to the document
 * being written (see the POST /api/revisions route) — without that, a forged id
 * would let this overwrite someone else's revision.
 */
const createRevision = async (data: Prisma.RevisionUncheckedCreateInput) => {
  return prisma.revision.upsert({
    where: { id: data.id as string },
    create: data,
    update: { data: data.data, createdAt: data.createdAt },
  });
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

export {
  createRevision,
  deleteRevision,
  findRevisionAuthorId,
  findRevisionDocumentId,
  getCachedRevision,
  updateRevision,
};
