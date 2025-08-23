import { DocumentType as PrismaDocumentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CloudDocument,
  DocumentStatus,
  type DocumentType,
  EditorDocument,
} from "@/types";
import { validate } from "uuid";
import { getCachedRevision } from "./revision";

// Transform: findPublishedDocuments → findPublishedPosts
const findPublishedPosts = async (limit?: number) => {
  console.log("findPublishedPosts called with limit:", limit);

  const posts = await prisma.document.findMany({
    where: {
      published: true,
      type: PrismaDocumentType.DOCUMENT, // Only regular documents, not directories
    },
    select: {
      id: true,
      handle: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      published: true,
      collab: true,
      private: true,
      baseId: true,
      head: true,
      type: true,
      background_image: true,
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
      // Remove coauthors complexity for blog posts
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: limit,
  });

  const cloudPosts = posts.map((post) => {
    const revisions = post.collab
      ? post.revisions
      : post.revisions.filter((revision) => revision.id === post.head);

    // Cast to CloudDocument to maintain compatibility during transition
    const cloudPost = {
      ...post,
      coauthors: [], // Remove coauthor complexity for simple blog
      revisions: revisions as any,
      type: PrismaDocumentType.DOCUMENT, // Always DOCUMENT for posts
      head: post.head || "",
    } as CloudDocument;

    return cloudPost;
  });

  console.log("findPublishedPosts found", cloudPosts.length, "posts");
  console.log("Post IDs:", cloudPosts.map((p) => p.id));

  return cloudPosts;
};

// Transform: findUserDocument → findUserPost
const findUserPost = async (
  handle: string,
  revisions?: "all" | string | null,
) => {
  console.log(
    "findUserPost called with handle:",
    handle,
    "revisions:",
    revisions,
  );

  // First, let's check if the document exists at all (without type filter)
  const anyDocument = await prisma.document.findFirst({
    where: validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
    select: { id: true, name: true, type: true },
  });
  console.log("Any document with this handle:", anyDocument);

  const post = await prisma.document.findFirst({
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

  console.log(
    "findUserPost query result:",
    post ? "found document" : "no document found",
  );
  if (!post) {
    console.log("No post found for handle:", handle);
    return null;
  }

  const cloudPost: CloudDocument = {
    ...post,
    coauthors: [], // Remove coauthor complexity
    type: PrismaDocumentType.DOCUMENT,
    head: post.head || "",
    revisions: post.revisions as any,
    status: (post as any).status,
  };

  if (revisions !== "all") {
    const revisionId = revisions ?? (post.head || "");
    const revision = cloudPost.revisions.find(
      (revision) => revision.id === revisionId,
    );
    if (!revision) return null;
    cloudPost.revisions = [revision as any];
    cloudPost.updatedAt = revision.createdAt;
  }

  return cloudPost;
};

// Transform: findDocumentsByAuthorId → findPostsByAuthorId
const findPostsByAuthorId = async (authorId: string) => {
  const posts = await prisma.document.findMany({
    where: {
      authorId,
      type: PrismaDocumentType.DOCUMENT, // Only regular documents, not directories
    },
    select: {
      id: true,
      handle: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      published: true,
      collab: true,
      private: true,
      baseId: true,
      head: true,
      type: true,
      background_image: true,
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
      // Remove coauthors complexity
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const cloudPosts = posts.map((post) => {
    const revisions = post.collab
      ? post.revisions
      : post.revisions.filter((revision) => revision.id === post.head);

    // Cast to CloudDocument to maintain compatibility during transition
    const cloudPost = {
      ...post,
      coauthors: [], // Remove coauthor complexity
      revisions: revisions as any,
      type: PrismaDocumentType.DOCUMENT,
      head: post.head || "",
    } as CloudDocument;

    return cloudPost;
  });

  return cloudPosts;
};

// Transform: findPublishedDocumentsByAuthorId → findPublishedPostsByAuthorId
const findPublishedPostsByAuthorId = async (authorId: string) => {
  const posts = await prisma.document.findMany({
    where: {
      authorId,
      published: true,
      type: PrismaDocumentType.DOCUMENT, // Only regular documents, not directories
    },
    select: {
      id: true,
      handle: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      published: true,
      collab: true,
      private: true,
      baseId: true,
      head: true,
      type: true,
      background_image: true,
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
      // Remove coauthors complexity
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const cloudPosts = posts.map((post) => {
    const revisions = post.collab
      ? post.revisions
      : post.revisions.filter((revision) => revision.id === post.head);

    const cloudPost: CloudDocument = {
      ...post,
      coauthors: [], // Remove coauthor complexity
      revisions: revisions as any,
      type: PrismaDocumentType.DOCUMENT,
      head: post.head || "",
    };

    return cloudPost;
  });

  return cloudPosts;
};

// Transform: createDocument → createPost
const createPost = async (data: Prisma.DocumentUncheckedCreateInput) => {
  if (!data.id) return null;

  // Ensure it's always a DOCUMENT type, not DIRECTORY
  const postData = {
    ...data,
    type: PrismaDocumentType.DOCUMENT,
    // For blog posts, we don't use parentId (flat structure)
    parentId: null,
  };

  await prisma.document.create({ data: postData });
  return findUserPost(data.id);
};

// Transform: updateDocument → updatePost
const updatePost = async (
  handle: string,
  data: Prisma.DocumentUncheckedUpdateInput,
) => {
  // Ensure type remains DOCUMENT
  const postData = {
    ...data,
    type: PrismaDocumentType.DOCUMENT,
  };

  await prisma.document.update({
    where: validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
    data: postData,
  });
  return findUserPost(handle, "all");
};

// Transform: deleteDocument → deletePost
const deletePost = async (handle: string) => {
  // First find the post to get its ID
  const post = await prisma.document.findFirst({
    where: {
      AND: [
        validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
        { type: PrismaDocumentType.DOCUMENT }, // Only allow deleting posts, not directories
      ],
    },
    select: { id: true },
  });

  if (!post) {
    throw new Error("Post not found");
  }

  return prisma.document.delete({
    where: { id: post.id },
  });
};

// Transform: findEditorDocument → findEditorPost
const findEditorPost = async (handle: string) => {
  const post = await prisma.document.findFirst({
    where: {
      AND: [
        validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
        { type: PrismaDocumentType.DOCUMENT }, // Only regular documents, not directories
      ],
    },
  });

  if (!post) return null;
  const revision = await getCachedRevision(post.head || "");
  if (!revision) return null;

  const editorPost: EditorDocument = {
    ...post,
    data: revision.data as unknown as EditorDocument["data"],
    type: PrismaDocumentType.DOCUMENT,
    status: (post as any).status as DocumentStatus,
    head: post.head || "",
  };

  return editorPost;
};

// Function to find cloud storage usage by author ID (posts only)
const findCloudStorageUsageByAuthorId = async (authorId: string) => {
  const postSizes = await prisma.$queryRaw<
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
      d."updatedAt" DESC;
  `;

  return postSizes;
};

// Export functions with new post naming
export {
  createPost,
  deletePost,
  findCloudStorageUsageByAuthorId,
  findEditorPost,
  findPostsByAuthorId,
  findPublishedPosts,
  findPublishedPostsByAuthorId,
  findUserPost,
  updatePost,
};
