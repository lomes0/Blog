import { UserDocument } from "@/types";

/**
 * Get the correct URL for a blog post
 * Posts should link to /view/{id} (same as browse route)
 */
export const getPostUrl = (doc: UserDocument): string => {
  return `/view/${doc.id}`;
};

/**
 * Check if a document is a published post
 */
export const isPublishedPost = (doc: UserDocument): boolean => {
  const docData = doc.local || doc.cloud;
  return docData?.type === "DOCUMENT" && (doc.cloud?.published === true);
};

/**
 * Get the creation date from a UserDocument
 * Prioritizes cloud data over local data
 */
export const getPostCreatedAt = (doc: UserDocument): Date | null => {
  const createdAt = doc.cloud?.createdAt || doc.local?.createdAt;
  return createdAt ? new Date(createdAt) : null;
};

/**
 * Sort posts by creation date in descending order (most recent first)
 */
export const sortPostsByDate = (posts: UserDocument[]): UserDocument[] => {
  return [...posts].sort((a, b) => {
    const dateA = getPostCreatedAt(a);
    const dateB = getPostCreatedAt(b);

    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;

    return dateB.getTime() - dateA.getTime();
  });
};
