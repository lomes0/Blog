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

const findRevisionAuthorId = async (id: string) => {
  const revision = await prisma.revision.findUnique({
    where: { id },
    select: {
      authorId: true,
    },
  });
  return revision?.authorId;
};

const createRevision = async (data: Prisma.RevisionUncheckedCreateInput) => {
  return prisma.revision.upsert({
    where: { id: data.id as string },
    create: data,
    update: {}, // no-op: if the revision already exists, keep it as-is
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
  getCachedRevision,
  updateRevision,
};
