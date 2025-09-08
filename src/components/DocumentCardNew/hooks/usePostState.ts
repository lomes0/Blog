import { useMemo } from "react";
import { User, UserDocument } from "@/types";
import { PostState } from "../PostChips";
import { useDocumentURL } from "../../DocumentURLContext";

/**
 * Consolidated state management hook for PostCard component
 *
 * This hook consolidates all the state calculations that were previously
 * scattered across multiple useMemo hooks in the PostCard component.
 *
 * @param userDocument - The user document (can be local, cloud, or both)
 * @param user - The current user
 * @returns Consolidated post state including document, author, postState, and href
 */
export const usePostState = (userDocument?: UserDocument, user?: User) => {
  const { getDocumentUrl } = useDocumentURL();

  return useMemo(() => {
    // Calculate post state (loading, draft, published)
    const postState: PostState = (() => {
      if (!userDocument) {
        return { isDraft: false, isPublished: false, isLoading: true };
      }

      const localDocument = userDocument.local;
      const cloudDocument = userDocument.cloud;
      const hasLocal = Boolean(localDocument);
      const hasCloud = Boolean(cloudDocument);

      return {
        isDraft: hasLocal && !hasCloud,
        isPublished: hasCloud,
        isLoading: false,
        documentStatus: cloudDocument?.status || localDocument?.status,
      };
    })();

    // Get the document to display (prefer local if available)
    const document = userDocument
      ? (userDocument.local || userDocument.cloud)
      : null;

    // Get author (from cloud document or current user)
    const author = userDocument?.cloud?.author ?? user;

    // Generate navigation URL
    const href = document && userDocument ? getDocumentUrl(userDocument) : "/";

    // Series information (if available)
    const seriesInfo = (() => {
      const cloudDoc = userDocument?.cloud as any; // TODO: Add proper Series type to UserDocument
      return {
        series: cloudDoc?.series || null,
        seriesOrder: cloudDoc?.seriesOrder || null,
      };
    })();

    // Generate aria label
    const ariaLabel = document ? `Open ${document.name} post` : "Loading post";

    return {
      document,
      author,
      postState,
      href,
      seriesInfo,
      ariaLabel,
    };
  }, [userDocument, user, getDocumentUrl]);
};

/**
 * Return type for usePostState hook
 */
export type PostStateHookResult = ReturnType<typeof usePostState>;
