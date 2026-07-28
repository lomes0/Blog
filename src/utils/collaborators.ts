import { RevisionMeta, User } from "@/types";

/**
 * Extract unique collaborators from document revisions
 * Excludes the primary author and removes duplicates
 *
 * @param revisions - Array of document revisions with author information
 * @param authorId - ID of the primary author to exclude
 * @param excludeUserIds - Additional user IDs to exclude (e.g., existing coauthors)
 * @returns Array of unique collaborators
 */
export function extractCollaborators(
  revisions: RevisionMeta[],
  authorId: string,
  excludeUserIds: string[] = [],
): User[] {
  const collaborators: User[] = [];
  const seenIds = new Set<string>([authorId, ...excludeUserIds]);

  for (const revision of revisions) {
    const author = revision.author;
    if (author && !seenIds.has(author.id)) {
      collaborators.push(author);
      seenIds.add(author.id);
    }
  }

  return collaborators;
}
