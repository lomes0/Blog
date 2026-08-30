import { apiClient } from "@/api";
import type { TreeContainer } from "@/lib/tree/model";
import type {
  MovePostArg,
  Post,
  PostCreateInput,
  PostUpdateInput,
  Revision,
  RevisionMeta,
} from "@/types";
import type { PostBackend } from "./index";

/**
 * Cloud storage — PostgreSQL behind `/api/*`, via the typed {@link apiClient}.
 *
 * Every method throws `ApiClientError` on failure (including network loss); the
 * thunks translate that into a rejected action, and the editor's save loop
 * treats it as "retry later" rather than "lost". See
 * `src/components/EditDocument/hooks/useSave.ts`.
 */

/** The API returns a post's metadata without its content. */
const toPost = (document: Post): Post => ({ ...document });

export const cloudBackend: PostBackend = {
  /**
   * The author's whole post list, assembled from pages.
   *
   * The store and every list view assume a complete array, so this walks
   * `nextCursor` to the end rather than returning the first page. The win is on
   * the database side: each statement is bounded and index-ordered instead of
   * one scan over everything the author has ever written. Serving pages
   * straight to the UI is the follow-up this makes possible.
   */
  async list() {
    const posts: Post[] = [];
    let cursor: string | undefined;
    do {
      const page = await apiClient.documents.list({ cursor });
      if (!page) break;
      posts.push(...page.documents.map(toPost));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return posts;
  },

  async get(id) {
    const payload = await apiClient.documents.get(id);
    if (!payload) return undefined;
    const { cloudDocument, ...editorDocument } = payload;
    // Metadata comes from the cloud record; content and the head it belongs to
    // come from the editor payload, which is what the editor actually renders.
    return {
      ...toPost(cloudDocument),
      head: editorDocument.head,
      updatedAt: editorDocument.updatedAt,
      data: editorDocument.data,
    };
  },

  async children(id) {
    const stubs = await apiClient.documents.children(id);
    return (stubs ?? []).map((stub) => ({ ...stub } as Post));
  },

  async create(input: PostCreateInput) {
    const document = await apiClient.documents.create(input);
    if (!document) throw new Error("failed to create post");
    return toPost(document);
  },

  async update(id, partial: PostUpdateInput) {
    // Content reaches the server through `revisions.create`, so sending it again
    // here would just double the payload of every autosave — the PATCH route
    // only uses `data` to back-fill a revision that already exists.
    const { data: _data, ...metadata } = partial;
    const document = await apiClient.documents.update(id, metadata);
    if (!document) throw new Error("failed to update post");
    return toPost(document);
  },

  async delete(id) {
    const deletedId = await apiClient.documents.delete(id);
    if (!deletedId) throw new Error("failed to delete post");
    return deletedId;
  },

  async move({ id, destination }: MovePostArg) {
    const document = await apiClient.documents.move(id, { destination });
    if (!document) throw new Error("failed to move post");
    return toPost(document);
  },

  // Order is written on the container that owns it, by container, so it does not
  // reach the cloud through this seam — which only knows about posts and could
  // not address a root list holding series and project ids. `setOrder` calls the
  // right endpoint directly; nothing here has to run.
  /**
   * One `PATCH` to the endpoint of whichever container owns the list
   * (docs/plans/ordering-simplification.md §4). Four containers, four
   * endpoints — the plan's §4 names three and misses `Project`.
   */
  async reorder(container: TreeContainer, orderedIds: string[]) {
    switch (container.type) {
      case "root":
        await apiClient.users.rootOrder(orderedIds);
        return;
      case "series":
        await apiClient.series.order(container.seriesId, orderedIds);
        return;
      case "project":
        await apiClient.projects.order(container.projectId, orderedIds);
        return;
      case "tabs":
        await apiClient.documents.tabOrder(container.parentId, orderedIds);
        return;
    }
  },

  /** Null: the signed-in root order rides on the session, not on a fetch. */
  async rootOrder() {
    return null;
  },

  revisions: {
    async get(id) {
      const revision = await apiClient.revisions.get(id);
      return revision as Revision | undefined;
    },

    async create(revision: Revision) {
      const created = await apiClient.revisions.create(revision);
      if (!created) throw new Error("failed to create revision");
      return created as RevisionMeta;
    },

    async delete(id, documentId) {
      const deleted = await apiClient.revisions.delete(id);
      if (!deleted) throw new Error("failed to delete revision");
      return { id: deleted.id, documentId: deleted.documentId ?? documentId };
    },
  },
};
