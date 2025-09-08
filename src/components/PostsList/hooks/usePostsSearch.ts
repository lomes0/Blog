import { useMemo } from "react";
import { UserDocument } from "@/types";

interface UsePostsSearchProps {
  posts: UserDocument[];
  searchQuery: string;
}

interface UsePostsSearchReturn {
  filteredPosts: UserDocument[];
  searchResults: {
    total: number;
    hasResults: boolean;
  };
}

/**
 * Custom hook for searching through posts
 * Searches in post titles, content, and author names
 */
export const usePostsSearch = ({
  posts,
  searchQuery,
}: UsePostsSearchProps): UsePostsSearchReturn => {
  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) {
      return posts;
    }

    const query = searchQuery.toLowerCase().trim();

    return posts.filter((post) => {
      const document = post.cloud || post.local;
      if (!document) return false;

      // Search in post title
      const title = document.name?.toLowerCase() || "";
      if (title.includes(query)) return true;

      // Search in post handle
      const handle = document.handle?.toLowerCase() || "";
      if (handle.includes(query)) return true;

      // Search in author name/email
      const author = post.cloud?.author;
      if (author) {
        const authorName = author.name?.toLowerCase() || "";
        const authorEmail = author.email?.toLowerCase() || "";
        if (authorName.includes(query) || authorEmail.includes(query)) {
          return true;
        }
      }

      // TODO: Search in post content (would require loading post content)
      // This could be implemented later for more comprehensive search

      return false;
    });
  }, [posts, searchQuery]);

  const searchResults = useMemo(() => ({
    total: filteredPosts.length,
    hasResults: filteredPosts.length > 0,
  }), [filteredPosts.length]);

  return {
    filteredPosts,
    searchResults,
  };
};
