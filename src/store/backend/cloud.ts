import { apiClient } from "@/api";
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
  async list() {
    const documents = await apiClient.documents.list();
    return (documents ?? []).map(toPost);
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

  // `rank` is intentionally unused: the server recomputes the authoritative rank
  // from `between` inside a transaction, which is what keeps concurrent reorders
  // consistent. The caller's rank only drives the optimistic update.
  async move({ id, destination, between }: MovePostArg & { rank: string }) {
    const document = await apiClient.documents.move(id, {
      destination,
      between,
    });
    if (!document) throw new Error("failed to move post");
    return toPost(document);
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
