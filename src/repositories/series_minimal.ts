import { DocumentType as PrismaDocumentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type DocumentType,
  Series,
  SeriesCreateInput,
  SeriesUpdateInput,
} from "@/types";

// Transform document data to series format
const transformDocumentToSeries = (doc: any): Series => ({
  id: doc.id,
  title: doc.name, // Document.name maps to Series.title
  description: doc.description || null, // Could use a custom field
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
  authorId: doc.authorId,
  author: doc.author,
  posts: [], // Will be populated separately if needed
});

// Find all series - temporarily return empty array
export async function findAllSeries(): Promise<Series[]> {
  // TODO: Implement when Series model is available in Prisma client
  return [];
}

// Find series by ID - temporarily return null
export async function findSeriesById(id: string): Promise<Series | null> {
  // TODO: Implement when Series model is available in Prisma client
  return null;
}

// Find series by author ID - temporarily return empty array
export async function findSeriesByAuthorId(
  authorId: string,
): Promise<Series[]> {
  // TODO: Implement when Series model is available in Prisma client
  return [];
}

// Create series - temporarily return mock data
export async function createSeries(data: SeriesCreateInput): Promise<Series> {
  // TODO: Implement when Series model is available in Prisma client
  return {
    id: data.id,
    title: data.title,
    description: data.description || null,
    createdAt: new Date(),
    updatedAt: new Date(),
    authorId: data.authorId,
    author: {
      id: data.authorId,
      name: "Unknown",
      handle: null,
      email: "",
      image: null,
    },
    posts: [],
  };
}

// Update series - temporarily return mock data
export async function updateSeries(
  id: string,
  data: SeriesUpdateInput,
): Promise<Series> {
  // TODO: Implement when Series model is available in Prisma client
  return {
    id,
    title: data.title || "Unknown",
    description: data.description || null,
    createdAt: new Date(),
    updatedAt: new Date(),
    authorId: "unknown",
    author: {
      id: "unknown",
      name: "Unknown",
      handle: null,
      email: "",
      image: null,
    },
    posts: [],
  };
}

// Delete series - temporarily do nothing
export async function deleteSeries(id: string): Promise<void> {
  // TODO: Implement when Series model is available in Prisma client
}

// Add post to series - temporarily do nothing
export async function addPostToSeries(
  seriesId: string,
  postId: string,
  order: number,
): Promise<void> {
  // TODO: Implement when Series model is available in Prisma client
}

// Remove post from series - temporarily do nothing
export async function removePostFromSeries(postId: string): Promise<void> {
  // TODO: Implement when Series model is available in Prisma client
}
