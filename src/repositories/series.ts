import { DocumentType as PrismaDocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { movePost, rankForAppendSeries, reRankIntoRoot } from "./ordering";
import {
  CloudPost,
  RevisionMeta,
  Series,
  SeriesCreateInput,
  SeriesUpdateInput,
} from "@/types";

// Author fields for owner-scoped queries — the caller is the author, so their
// own email coming back is not a disclosure.
const authorSelect = {
  id: true,
  handle: true,
  name: true,
  email: true,
  image: true,
};

// Author fields for anything a stranger can read. Email is deliberately absent:
// a public series listing must not become an address-harvesting endpoint.
const publicAuthorSelect = {
  id: true,
  handle: true,
  name: true,
  image: true,
};

/**
 * The post fields a series carries with it.
 *
 * This block was copy-pasted verbatim into three queries; a `where` clause added
 * to one and not the others is precisely how the public listing ended up
 * serving unpublished posts. It is built once here and parameterised by which
 * author fields are safe to include.
 */
const postSelect = (author: typeof authorSelect | typeof publicAuthorSelect) =>
  ({
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
    author: { select: author },
    coauthors: {
      select: { user: { select: author } },
      orderBy: { createdAt: "asc" as const },
    },
    revisions: {
      select: {
        id: true,
        createdAt: true,
        documentId: true,
        authorId: true,
        author: { select: author },
      },
      orderBy: { createdAt: "desc" as const },
    },
  }) as const;

/**
 * Posts a stranger may see inside a series: published and not private.
 *
 * Both flags are checked because they are independent — a post can be published
 * *and* private, and must still stay out of a public listing. This mirrors
 * `findPublishedDocuments` in the document repository.
 */
const publiclyVisiblePosts = {
  type: PrismaDocumentType.DOCUMENT,
  published: true,
  private: false,
} as const;

/**
 * Every series that has something public to show, for anonymous surfaces (the
 * landing page, `GET /api/series` without a session).
 *
 * Public means public all the way down: only published, non-private posts are
 * included, only series that still have at least one such post are returned,
 * and author emails are omitted. Before this filter existed the landing page
 * and the anonymous API branch both served every author's unpublished drafts —
 * including each draft's `head` revision id, which was enough to fetch its full
 * body from `GET /api/revisions/[id]`.
 *
 * Owner-facing listings use {@link findSeriesByAuthorId}, which is unfiltered
 * by design.
 */
export async function findAllSeries(): Promise<Series[]> {
  const series = await prisma.series.findMany({
    where: { posts: { some: publiclyVisiblePosts } },
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
        select: publicAuthorSelect,
      },
      posts: {
        select: postSelect(publicAuthorSelect),
        where: publiclyVisiblePosts,
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
      revisions: p.revisions as RevisionMeta[],
    })) as CloudPost[],
  })) as Series[];
}

/**
 * One series as a stranger may see it, or null when it has nothing public.
 *
 * The owner-facing {@link findSeriesById} returns the series whole; this is the
 * variant safe to hand to an unauthenticated caller.
 */
export async function findPublicSeriesById(
  id: string,
): Promise<Series | null> {
  const series = await prisma.series.findFirst({
    where: { id, posts: { some: publiclyVisiblePosts } },
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
        select: publicAuthorSelect,
      },
      posts: {
        select: postSelect(publicAuthorSelect),
        where: publiclyVisiblePosts,
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
      revisions: p.revisions as RevisionMeta[],
    })) as CloudPost[],
  } as Series;
}

/**
 * One series with everything on it, for the author's own views and for the
 * ownership checks the write routes run before mutating it.
 *
 * Unfiltered: it returns unpublished and private posts. Never hand the result
 * to a caller who has not been proved to be `series.authorId` — use
 * {@link findPublicSeriesById} for that.
 */
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
        select: postSelect(authorSelect),
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
      revisions: p.revisions as RevisionMeta[],
    })) as CloudPost[],
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
        select: postSelect(authorSelect),
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
      revisions: p.revisions as RevisionMeta[],
    })) as CloudPost[],
  })) as Series[];
}

// Create series and return full entity with relations
export async function createSeries(data: SeriesCreateInput): Promise<Series> {
  // A series may be born inside a project — the sidebar's per-project "+"
  // creates one there directly. Its rank belongs to whichever space it lands
  // in, so the container decides it rather than the call site.
  const projectId = data.projectId ?? null;
  const rank = await rankForAppendSeries(prisma, {
    authorId: data.authorId,
    projectId,
  });
  await prisma.series.create({
    data: {
      id: data.id,
      title: data.title,
      description: data.description,
      authorId: data.authorId,
      projectId,
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
    movePost(tx, { id: postId, destination: { seriesId } })
  );
}

// Remove a post from its series, re-homing it to the author's root list.
export async function removePostFromSeries(postId: string): Promise<void> {
  await prisma.$transaction((tx) =>
    movePost(tx, { id: postId, destination: {} })
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
      await movePost(tx, { id: postId, destination: {} });
    }
    for (const postId of postIdsToAdd) {
      await movePost(tx, { id: postId, destination: { seriesId } });
    }
  });
}

// Get posts available to add to a series (user's posts not in any series)
export async function getAvailablePostsForSeries(
  authorId: string,
): Promise<CloudPost[]> {
  const posts = await prisma.document.findMany({
    where: {
      authorId,
      seriesId: null,
      type: PrismaDocumentType.DOCUMENT,
    },
    select: postSelect(authorSelect),
    orderBy: {
      updatedAt: "desc",
    },
  });

  return posts.map((p) => ({
    ...p,
    type: p.type as "DOCUMENT",
    head: p.head || "",
    coauthors: p.coauthors.map((c) => c.user),
    revisions: p.revisions as RevisionMeta[],
  })) as CloudPost[];
}
