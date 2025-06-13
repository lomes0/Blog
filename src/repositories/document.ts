import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CloudDocument, DocumentType, EditorDocument } from "@/types";
import { validate } from "uuid";
import { getCachedRevision } from "./revision";

const findPublishedDocuments = async (limit?: number) => {
  const documents = await prisma.document.findMany({
    where: { published: true },
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
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      },
      author: {
        select: {
          id: true,
          handle: true,
          name: true,
          image: true,
          email: true,
        }
      },
      coauthors: {
        select: {
          user: {
            select: {
              id: true,
              handle: true,
              name: true,
              image: true,
              email: true,
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      },
    },
    orderBy: {
      updatedAt: 'desc'
    },
    take: limit
  });

  const cloudDocuments = documents.map((document) => {
    const revisions = document.collab ? document.revisions : document.revisions.filter((revision) => revision.id === document.head);
    
    // Cast to CloudDocument to avoid type errors
    const cloudDocument = {
      ...document,
      coauthors: document.coauthors.map((coauthor) => coauthor.user),
      revisions: revisions as any,
      type: (document as any).type || DocumentType.DOCUMENT,
      head: document.head || ''
    } as CloudDocument;
    
    return cloudDocument;
  });
  
  return cloudDocuments;
}

const findUserDocument = async (handle: string, revisions?: "all" | string | null) => {
  const document = await prisma.document.findUnique({
    where: validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
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
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      },
      author: {
        select: {
          id: true,
          handle: true,
          name: true,
          image: true,
          email: true,
        }
      },
      coauthors: {
        select: {
          user: {
            select: {
              id: true,
              handle: true,
              name: true,
              image: true,
              email: true,
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      },
    }
  });

  if (!document) return null;

  const cloudDocument: CloudDocument = {
    ...document,
    coauthors: document.coauthors.map((coauthor) => coauthor.user),
    // Use the document's type or default to DOCUMENT if not specified
    type: (document as any).type || DocumentType.DOCUMENT,
    head: document.head || '',
    revisions: document.revisions as any,
  };
  
  if (revisions !== "all") {
    const revisionId = revisions ?? (document.head || '');
    const revision = cloudDocument.revisions.find((revision) => revision.id === revisionId);
    if (!revision) return null;
    cloudDocument.revisions = [revision as any];
    cloudDocument.updatedAt = revision.createdAt;
  }
  
  return cloudDocument;
}

const createDocument = async (data: Prisma.DocumentUncheckedCreateInput) => {
  if (!data.id) return null;
  await prisma.document.create({ data });
  return findUserDocument(data.id);
}

const updateDocument = async (handle: string, data: Prisma.DocumentUncheckedUpdateInput) => {
  await prisma.document.update({
    where: validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
    data
  });
  return findUserDocument(handle, "all");
}

const deleteDocument = async (handle: string) => {
  return prisma.document.delete({
    where: validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
  });
}

// Additional helpers for directory-specific operations
const findEditorDocument = async (handle: string) => {
  const document = await prisma.document.findUnique({
    where: validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
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
    },
  });

  if (!document) return null;
  const revision = await getCachedRevision(document.head || '');
  if (!revision) return null;

  const editorDocument: EditorDocument = {
    ...document,
    data: revision.data as unknown as EditorDocument['data'],
    type: (document as any).type || DocumentType.DOCUMENT,
    head: document.head || '',
  };

  return editorDocument;
}

// Function to find documents by author ID
const findDocumentsByAuthorId = async (authorId: string) => {
  const documents = await prisma.document.findMany({
    where: { authorId },
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
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      },
      author: {
        select: {
          id: true,
          handle: true,
          name: true,
          image: true,
          email: true,
        }
      },
      coauthors: {
        select: {
          user: {
            select: {
              id: true,
              handle: true,
              name: true,
              image: true,
              email: true,
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      },
    },
    orderBy: {
      updatedAt: 'desc'
    },
  });

  const cloudDocuments = documents.map((document) => {
    const revisions = document.collab ? document.revisions : document.revisions.filter((revision) => revision.id === document.head);
    
    // Cast to CloudDocument to avoid type errors
    const cloudDocument = {
      ...document,
      coauthors: document.coauthors.map((coauthor) => coauthor.user),
      revisions: revisions as any,
      type: (document as any).type || DocumentType.DOCUMENT,
      head: document.head || ''
    } as CloudDocument;
    
    return cloudDocument;
  });
  
  return cloudDocuments;
};

// Function to find published documents by author ID
const findPublishedDocumentsByAuthorId = async (authorId: string) => {
  const documents = await prisma.document.findMany({
    where: { authorId, published: true },
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
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      },
      author: {
        select: {
          id: true,
          handle: true,
          name: true,
          image: true,
          email: true,
        }
      },
      coauthors: {
        select: {
          user: {
            select: {
              id: true,
              handle: true,
              name: true,
              image: true,
              email: true,
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      },
    },
    orderBy: {
      updatedAt: 'desc'
    }
  });

  const cloudDocuments = documents.map((document) => {
    const revisions = document.collab ? document.revisions : document.revisions.filter((revision) => revision.id === document.head);
    const cloudDocument: CloudDocument = {
      ...document,
      coauthors: document.coauthors.map((coauthor) => coauthor.user),
      revisions: revisions as any,
      type: (document as any).type || DocumentType.DOCUMENT,
      head: document.head || ''
    };
    return cloudDocument;
  });

  return cloudDocuments;
};

// Function to find cloud storage usage by author ID
const findCloudStorageUsageByAuthorId = async (authorId: string) => {
  const documentSizes = await prisma.$queryRaw<{ id: string, name: string, size: number }[]>`
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
    GROUP BY 
      d.id
    ORDER BY 
      d."updatedAt" DESC;
  `;

  return documentSizes;
};

// Export functions
export {
  findPublishedDocuments,
  findUserDocument,
  findEditorDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  findDocumentsByAuthorId,
  findPublishedDocumentsByAuthorId,
  findCloudStorageUsageByAuthorId,
};
