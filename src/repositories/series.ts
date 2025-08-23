import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DocumentType, Series, SeriesCreateInput, SeriesUpdateInput } from "@/types";

// Transform document data to series format 
const transformDocumentToSeries = (doc: any): Series => ({
  id: doc.id,
  title: doc.name, // Document.name maps to Series.title
  description: doc.description || null, // Could use a custom field
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
  authorId: doc.authorId,
  author: {
    id: doc.author.id,
    name: doc.author.name,
    handle: doc.author.handle,
    email: doc.author.email,
    image: doc.author.image,
  },
  posts: doc.children?.map((child: any) => ({
    id: child.id,
    title: child.name,
    content: child.content || '',
    createdAt: child.createdAt,
    updatedAt: child.updatedAt,
    published: child.published || false,
    authorId: child.authorId,
    author: child.author,
    seriesId: doc.id,
    series: null, // Avoid circular reference
    seriesOrder: child.sort_order || 0,
    revisions: child.revisions || [],
  })) || [],
});

// Find all series (documents of type DIRECTORY)
export async function findAllSeries(): Promise<Series[]> {
  const series = await prisma.document.findMany({
    where: { 
      type: DocumentType.DIRECTORY,
      published: true,
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          handle: true,
          email: true,
          image: true,
        },
      },
      children: {
        where: {
          type: DocumentType.DOCUMENT,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              handle: true,
              email: true,
              image: true,
            },
          },
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
        },
        orderBy: {
          sort_order: "asc",
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return series.map(transformDocumentToSeries);
}

// Find series by ID  
export async function findSeriesById(id: string): Promise<Series | null> {
  const series = await prisma.document.findFirst({
    where: { 
      id,
      type: DocumentType.DIRECTORY,
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          handle: true,
          email: true,
          image: true,
        },
      },
      children: {
        where: {
          type: DocumentType.DOCUMENT,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              handle: true,
              email: true,
              image: true,
            },
          },
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
        },
        orderBy: {
          sort_order: "asc",
        },
      },
    },
  });

  return series ? transformDocumentToSeries(series) : null;
}

// Find series by author ID
export async function findSeriesByAuthorId(authorId: string): Promise<Series[]> {
  const series = await prisma.document.findMany({
    where: { 
      authorId,
      type: DocumentType.DIRECTORY,
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          handle: true,
          email: true,
          image: true,
        },
      },
      children: {
        where: {
          type: DocumentType.DOCUMENT,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              handle: true,
              email: true,
              image: true,
            },
          },
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
        },
        orderBy: {
          sort_order: "asc",
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return series.map(transformDocumentToSeries);
}

// Create a new series (create a document of type DIRECTORY)
export async function createSeries(data: SeriesCreateInput): Promise<Series | null> {
  const series = await prisma.document.create({
    data: {
      id: data.id,
      name: data.title,
      type: DocumentType.DIRECTORY,
      authorId: data.authorId,
      published: true,
      head: "", // Required field
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          handle: true,
          email: true,
          image: true,
        },
      },
      children: {
        where: {
          type: DocumentType.DOCUMENT,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              handle: true,
              email: true,
              image: true,
            },
          },
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
        },
        orderBy: {
          sort_order: "asc",
        },
      },
    },
  });

  return transformDocumentToSeries(series);
}

// Update a series
export async function updateSeries(id: string, data: SeriesUpdateInput): Promise<Series | null> {
  const updateData: Prisma.DocumentUpdateInput = {};
  
  if (data.title !== undefined) {
    updateData.name = data.title;
  }
  
  if (data.description !== undefined) {
    // Note: description field may need to be added to Document schema or stored in a custom way
    // For now, we'll skip this field
  }

  updateData.updatedAt = new Date();

  const series = await prisma.document.update({
    where: { id },
    data: updateData,
    include: {
      author: {
        select: {
          id: true,
          name: true,
          handle: true,
          email: true,
          image: true,
        },
      },
      children: {
        where: {
          type: DocumentType.DOCUMENT,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              handle: true,
              email: true,
              image: true,
            },
          },
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
        },
        orderBy: {
          sort_order: "asc",
        },
      },
    },
  });

  return transformDocumentToSeries(series);
}

// Delete a series (remove posts from series first)
export async function deleteSeries(id: string): Promise<void> {
  // First, remove posts from series (set parentId to null)
  await prisma.document.updateMany({
    where: {
      parentId: id,
      type: DocumentType.DOCUMENT,
    },
    data: {
      parentId: null,
      sort_order: null,
    },
  });

  // Then delete the series document
  await prisma.document.delete({
    where: { id },
  });
}

// Add a post to a series
export async function addPostToSeries(seriesId: string, postId: string, order: number): Promise<void> {
  await prisma.document.update({
    where: { id: postId },
    data: {
      parentId: seriesId,
      sort_order: order,
    },
  });
}

// Remove a post from a series
export async function removePostFromSeries(postId: string): Promise<void> {
  await prisma.document.update({
    where: { id: postId },
    data: {
      parentId: null,
      sort_order: null,
    },
  });
}
