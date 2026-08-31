import { useMemo } from "react";
import { Post, User } from "@/types";
import { PostState } from "../PostChips";
import { seriesPositionOf } from "@/utils/posts/seriesGrouping";
import { useDocumentURL } from "@/contexts/DocumentURLContext";

/**
 * Everything PostCard needs to render one post, derived in a single pass.
 *
 * "Draft" now means what it says — a post that has not been published — rather
 * than the old proxy of "exists locally but not in the cloud". A guest's posts
 * are all drafts because publishing needs an account.
 *
 * @param post - The post to render
 * @param user - The current user, absent for guests
 */
export const usePostState = (post?: Post, user?: User) => {
  const { getDocumentUrl } = useDocumentURL();

  return useMemo(() => {
    const postState: PostState = post
      ? {
        isDraft: !post.published,
        isPublished: !!post.published,
        isLoading: false,
        documentStatus: post.status,
      }
      : { isDraft: false, isPublished: false, isLoading: true };

    const author = post?.author ?? user;
    const href = post ? getDocumentUrl(post) : "/";

    const seriesInfo = {
      series: post?.series ?? null,
      seriesOrder: seriesPositionOf(post?.series, post?.id ?? ""),
    };

    const ariaLabel = post ? `Open ${post.title} post` : "Loading post";

    return {
      document: post ?? null,
      author,
      postState,
      href,
      seriesInfo,
      ariaLabel,
      status: post?.status,
    };
  }, [post, user, getDocumentUrl]);
};
