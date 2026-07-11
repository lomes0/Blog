import { DocumentType as PrismaDocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  moveDocument,
  rankForAppend,
  reRankIntoRoot,
} from "./ordering";
import {
  Document,
  DocumentRevision,
  Series,
  SeriesCreateInput,
  SeriesUpdateInput,
} from "@/types";

// Standard author selection for consistency
const authorSelect = {
  id: true,
  handle: true,
  name: true,
  email: true,
  image: true,
};

// Find all series with author relations
export async function findAllSeries(): Promise<Series[]> {
  const series = await prisma.series.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      authorId: true,
      projectId: true,
      rank: true,
      author: {
        select: authorSelect,
      },
      posts: {
        select: {
          id: true,
          handle: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          authorId: true,
          published: true,
          private: true,
          head: true,
          collab: true,
          status: true,
          seriesId: true,
          background_image: true,
          rank: true,
          baseId: true,
          parentId: true,
          type: true,
          author: {
            select: authorSelect,
          },
          coauthors: {
            select: {
              user: {
                select: authorSelect,
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          revisions: {
            select: {
              id: true,
              createdAt: true,
              documentId: true,
              authorId: true,
              author: {
                select: authorSelect,
              },
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
        where: {
          type: PrismaDocumentType.DOCUMENT,
        },
        orderBy: {
          rank: "asc",
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return series.map((s) => ({
    ...s,
    posts: s.posts.map((p) => ({
      ...p,
      type: p.type as "DOCUMENT",
      head: p.head || "",
      coauthors: p.coauthors.map((c) => c.user),
      revisions: p.revisions as DocumentRevision[],
    })) as Document[],
  })) as Series[];
}

// Find series by ID with full relations
export async function findSeriesById(id: string): Promise<Series | null> {
  const series = await prisma.series.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      authorId: true,
      projectId: true,
      rank: true,
      author: {
        select: authorSelect,
      },
      posts: {
        select: {
          id: true,
          handle: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          authorId: true,
          published: true,
          private: true,
          head: true,
          collab: true,
          status: true,
          seriesId: true,
          background_image: true,
          rank: true,
          baseId: true,
          parentId: true,
          type: true,
          author: {
            select: authorSelect,
          },
          coauthors: {
            select: {
              user: {
                select: authorSelect,
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          revisions: {
            select: {
              id: true,
              createdAt: true,
              documentId: true,
              authorId: true,
              author: {
                select: authorSelect,
              },
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
        where: {
          type: PrismaDocumentType.DOCUMENT,
        },
        orderBy: {
          rank: "asc",
        },
      },
    },
  });

  if (!series) return null;

  return {
    ...series,
    posts: series.posts.map((p) => ({
      ...p,
      type: p.type as "DOCUMENT",
      head: p.head || "",
      coauthors: p.coauthors.map((c) => c.user),
      revisions: p.revisions as DocumentRevision[],
    })) as Document[],
  } as Series;
}

// Find series by author ID
export async function findSeriesByAuthorId(
  authorId: string,
): Promise<Series[]> {
  const series = await prisma.series.findMany({
    where: { authorId },
    select: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      authorId: true,
      projectId: true,
      rank: true,
      author: {
        select: authorSelect,
      },
      posts: {
        select: {
          id: true,
          handle: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          authorId: true,
          published: true,
          private: true,
          head: true,
          collab: true,
          status: true,
          seriesId: true,
          background_image: true,
          rank: true,
          baseId: true,
          parentId: true,
          type: true,
          author: {
            select: authorSelect,
          },
          coauthors: {
            select: {
              user: {
                select: authorSelect,
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          revisions: {
            select: {
              id: true,
              createdAt: true,
              documentId: true,
              authorId: true,
              author: {
                select: authorSelect,
              },
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
        where: {
          type: PrismaDocumentType.DOCUMENT,
        },
        orderBy: {
          rank: "asc",
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return series.map((s) => ({
    ...s,
    posts: s.posts.map((p) => ({
      ...p,
      type: p.type as "DOCUMENT",
      head: p.head || "",
      coauthors: p.coauthors.map((c) => c.user),
      revisions: p.revisions as DocumentRevision[],
    })) as Document[],
  })) as Series[];
}

// Create series and return full entity with relations
export async function createSeries(data: SeriesCreateInput): Promise<Series> {
  const rank = await rankForAppend(prisma, {
    authorId: data.authorId,
    seriesId: null,
    parentId: null,
  });
  await prisma.series.create({
    data: {
      id: data.id,
      title: data.title,
      description: data.description,
      authorId: data.authorId,
      rank,
    },
  });

  const series = await findSeriesById(data.id);
  if (!series) {
    throw new Error("Failed to create series");
  }
  return series;
}

// Update series and return updated entity
export async function updateSeries(
  id: string,
  data: SeriesUpdateInput,
): Promise<Series> {
  await prisma.series.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    },
  });

  const series = await findSeriesById(id);
  if (!series) {
    throw new Error("Failed to update series");
  }
  return series;
}

// Delete a series; its posts are re-homed to the end of the author's root list
// (in their prior order) in the same transaction, so they don't keep ranks that
// belonged to the now-deleted series' space.
export async function deleteSeries(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const series = await tx.series.findUnique({
      where: { id },
      select: { authorId: true },
    });
    if (!series) throw new Error("Series not found");

    const members = await tx.document.findMany({
      where: { seriesId: id },
      orderBy: { rank: "asc" },
      select: { id: true },
    });

    await tx.series.delete({ where: { id } });
    await reRankIntoRoot(tx, series.authorId, members.map((m) => m.id));
  });
}

// Add a post to a series, appended to the end of the series.
export async function addPostToSeries(
  seriesId: string,
  postId: string,
): Promise<void> {
  await prisma.$transaction((tx) =>
    moveDocument(tx, { id: postId, destination: { seriesId } })
  );
}

// Remove a post from its series, re-homing it to the author's root list.
export async function removePostFromSeries(postId: string): Promise<void> {
  await prisma.$transaction((tx) =>
    moveDocument(tx, { id: postId, destination: {} })
  );
}

// Batch add/remove posts from a series in a single transaction. Removed posts
// are re-homed to root; added posts are appended to the series.
export async function batchUpdateSeriesPosts(
  seriesId: string,
  postIdsToAdd: string[],
  postIdsToRemove: string[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const postId of postIdsToRemove) {
      await moveDocument(tx, { id: postId, destination: {} });
    }
    for (const postId of postIdsToAdd) {
      await moveDocument(tx, { id: postId, destination: { seriesId } });
    }
  });
}

// Get posts available to add to a series (user's posts not in any series)
export async function getAvailablePostsForSeries(
  authorId: string,
): Promise<Document[]> {
  const posts = await prisma.document.findMany({
    where: {
      authorId,
      seriesId: null,
      type: PrismaDocumentType.DOCUMENT,
    },
    select: {
      id: true,
      handle: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      authorId: true,
      published: true,
      private: true,
      head: true,
      collab: true,
      status: true,
      seriesId: true,
      background_image: true,
      rank: true,
      baseId: true,
      parentId: true,
      type: true,
      author: {
        select: authorSelect,
      },
      coauthors: {
        select: {
          user: {
            select: authorSelect,
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      revisions: {
        select: {
          id: true,
          createdAt: true,
          documentId: true,
          authorId: true,
          author: {
            select: authorSelect,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return posts.map((p) => ({
    ...p,
    type: p.type as "DOCUMENT",
    head: p.head || "",
    coauthors: p.coauthors.map((c) => c.user),
    revisions: p.revisions as DocumentRevision[],
  })) as Document[];
}
