import { useEffect, useState } from "react";
import { UserDocument } from "@/types";
import { useThumbnailContext } from "../../../app/context/ThumbnailContext";
import { loadThumbnailWithFallbacks } from "../utils/postHelpers";

/**
 * Hook return type for usePostContent
 */
export interface UsePostContentResult {
  thumbnail: string | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Consolidated content loading hook
 *
 * This hook consolidates all thumbnail loading logic from PostThumbnail
 * and provides better error handling, retry functionality, and performance
 * optimizations.
 *
 * Features:
 * - Unified loading state management
 * - Error handling with retry capability
 * - Backward compatibility with thumbnail context
 * - Improved caching strategy
 * - Proper cleanup on unmount
 *
 * @param userDocument - The user document to load content for
 * @returns Object containing thumbnail data, loading state, error state, and retry function
 */
export const usePostContent = (
  userDocument?: UserDocument,
): UsePostContentResult => {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get the document to display (prefer local over cloud)
  const document = userDocument?.local || userDocument?.cloud;

  // Try to use thumbnail context first for backward compatibility
  const thumbnailContext = useThumbnailContext();
  const contextThumbnail = thumbnailContext?.[document?.head ?? ""];

  const loadContent = async () => {
    if (!document?.id || !document?.head) {
      setIsLoading(false);
      setError("No document ID or head available");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // If we have context thumbnail, use it (existing behavior)
      if (contextThumbnail) {
        try {
          const thumbnailData = await contextThumbnail;
          setThumbnail(thumbnailData);
          return;
        } catch (contextError) {
          console.warn("Context thumbnail failed, falling back:", contextError);
          // Continue to fallback loading
        }
      }

      // Use improved caching strategy with fallbacks
      const thumbnailData = await loadThumbnailWithFallbacks(userDocument);

      if (thumbnailData) {
        setThumbnail(thumbnailData);
      } else {
        setError("Failed to load thumbnail content");
      }
    } catch (loadError) {
      const errorMessage = loadError instanceof Error
        ? loadError.message
        : "Unknown error";
      console.warn("Failed to load thumbnail:", loadError);
      setError(errorMessage);
      setThumbnail(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Retry function to reload content
  const retry = () => {
    if (document?.id && document?.head) {
      loadContent();
    }
  };

  useEffect(() => {
    // Reset states when userDocument changes
    if (!userDocument) {
      setThumbnail(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    loadContent();

    // Cleanup function to handle component unmount
    return () => {
      // Reset state if component unmounts during loading
      setThumbnail(null);
      setIsLoading(false);
      setError(null);
    };
  }, [document?.id, document?.head, contextThumbnail, userDocument]);

  return {
    thumbnail,
    isLoading,
    error,
    retry,
  };
};

/**
 * Type alias for backward compatibility
 */
export type PostContentHookResult = UsePostContentResult;

export default usePostContent;
