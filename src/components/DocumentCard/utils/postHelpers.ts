import { UserDocument } from "@/types";
import { generateHtml } from "@/editor/utils/generateHtml";
import documentDB from "@/indexeddb";
import thumbnailCache from "./thumbnailCache";

/**
 * Enhanced thumbnail loading with improved fallback strategies
 * 
 * This function implements a robust thumbnail loading strategy with:
 * - Advanced caching using the new ThumbnailCache
 * - Multiple fallback sources
 * - Error handling and retry logic
 * - Performance optimizations
 */
export const loadThumbnailWithFallbacks = async (
  userDocument?: UserDocument
): Promise<string | null> => {
  if (!userDocument) return null;

  const document = userDocument.local || userDocument.cloud;
  if (!document?.id || !document?.head) return null;

  const cacheKey = document.head;
  const documentId = document.id;

  try {
    // 1. Check advanced cache first
    const cachedThumbnail = thumbnailCache.get(cacheKey);
    if (cachedThumbnail) {
      return cachedThumbnail;
    }

    // 2. Try local document (fastest)
    if (userDocument.local) {
      const localThumbnail = await loadFromLocalDocument(documentId);
      if (localThumbnail) {
        thumbnailCache.set(cacheKey, localThumbnail);
        return localThumbnail;
      }
    }

    // 3. Try IndexedDB cache
    const indexedDBThumbnail = await loadFromIndexedDB(documentId);
    if (indexedDBThumbnail) {
      thumbnailCache.set(cacheKey, indexedDBThumbnail);
      return indexedDBThumbnail;
    }

    // 4. Fallback to API (slowest)
    const apiThumbnail = await loadFromAPI(documentId);
    if (apiThumbnail) {
      thumbnailCache.set(cacheKey, apiThumbnail);
      return apiThumbnail;
    }

    return null;
  } catch (error) {
    console.warn(`Failed to load thumbnail for document ${documentId}:`, error);
    return null;
  }
};

/**
 * Load thumbnail from local document in memory
 */
const loadFromLocalDocument = async (documentId: string): Promise<string | null> => {
  try {
    const document = await documentDB.getByID(documentId);
    if (!document?.data) return null;

    const data = document.data;
    const thumbnail = await generateHtml({
      ...data,
      root: { ...data.root, children: data.root.children.slice(0, 3) },
    });

    return thumbnail;
  } catch (error) {
    console.warn("Failed to load from local document:", error);
    return null;
  }
};

/**
 * Load thumbnail from IndexedDB
 */
const loadFromIndexedDB = async (documentId: string): Promise<string | null> => {
  try {
    const document = await documentDB.getByID(documentId);
    if (!document?.data) return null;

    const data = document.data;
    const thumbnail = await generateHtml({
      ...data,
      root: { ...data.root, children: data.root.children.slice(0, 3) },
    });

    return thumbnail;
  } catch (error) {
    console.warn("Failed to load from IndexedDB:", error);
    return null;
  }
};

/**
 * Load thumbnail from API with retry logic
 */
const loadFromAPI = async (
  documentId: string,
  retries = 2
): Promise<string | null> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`/api/thumbnails/${documentId}`, {
        // Add cache headers for better performance
        headers: {
          'Cache-Control': 'max-age=300', // 5 minutes cache
        },
      });

      if (response.ok) {
        const { data } = await response.json();
        if (data) {
          return data;
        }
      }

      // If not successful and we have retries left, wait before retry
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    } catch (error) {
      console.warn(`API attempt ${attempt + 1} failed:`, error);
      
      // If it's the last attempt, don't retry
      if (attempt === retries) {
        throw error;
      }
    }
  }

  return null;
};

/**
 * Get cache statistics for debugging
 */
export const getThumbnailCacheStats = () => {
  return thumbnailCache.getStats();
};

/**
 * Clear thumbnail cache (useful for testing or memory cleanup)
 */
export const clearThumbnailCache = () => {
  thumbnailCache.clear();
};

/**
 * Preload thumbnails for a list of documents
 * Useful for optimizing performance when loading multiple cards
 */
export const preloadThumbnails = async (userDocuments: UserDocument[]): Promise<void> => {
  const loadPromises = userDocuments
    .filter(doc => doc && (doc.local || doc.cloud))
    .map(doc => loadThumbnailWithFallbacks(doc));

  // Load thumbnails in parallel but don't await all - fire and forget
  Promise.allSettled(loadPromises).catch(error => {
    console.warn("Some thumbnail preloads failed:", error);
  });
};

/**
 * Generate a cache key for a document
 */
export const generateCacheKey = (userDocument: UserDocument): string => {
  const document = userDocument.local || userDocument.cloud;
  return document?.head || `${document?.id}-${Date.now()}`;
};
