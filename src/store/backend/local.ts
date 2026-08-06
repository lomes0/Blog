import { getStore } from "@/indexeddb";
import type {
  MovePostArg,
  Post,
  PostCreateInput,
  PostUpdateInput,
  Revision,
  RevisionMeta,
} from "@/types";
import { validate as isUuid } from "uuid";
import type { PostBackend } from "./index";

/**
 * Local storage — IndexedDB, used for guest drafts.
 *
 * Guests have no server, so this backend never fails on network and every
 * operation resolves in the same tick. That is what lets the editor's save loop
 * run unchanged for both modes: for a guest the "pending save" record is written
 * and cleared immediately, so the resilience machinery is simply a no-op.
 *
 * Fields that only exist in the cloud (author, coauthors, publish/collab/private
 * flags, joined series) are stripped before writing — a guest draft has no
 * meaningful value for them, and persisting stale copies would be a trap.
 */

const postDB = getStore<Post>("documents");
const revisionDB = getStore<Revision>("revisions");

/** IndexedDB round-trips `Date`s; the store keeps timestamps as ISO strings. */
const iso = (value: string | Date): string =>
  value instanceof Date ? value.toISOString() : value;

/** What actually lands in the `documents` store. */
type StoredPost = Omit<
  Post,
  "author" | "coauthors" | "published" | "collab" | "private" | "series"
>;

// `coauthors` is `User[]` on a Post but `string[]` (emails) on a create input;
// both are dropped, so the key list is typed rather than destructured.
const NOT_STORED = [
  "author",
  "coauthors",
  "published",
  "collab",
  "private",
  "series",
  "revisions", // revisions live in their own store
  // A precondition for the cloud's compare-and-set, not a column. IndexedDB has
  // one writer per browser, so there is no race here to guard — but the field
  // still must not end up in the stored record.
  "expectedHead",
] as const;

/** Drop cloud-only fields and content-adjacent collections before persisting. */
function toStored<T extends object>(post: T): Partial<StoredPost> {
  const stored = { ...post } as Record<string, unknown>;
  for (const key of NOT_STORED) delete stored[key];
  return stored as Partial<StoredPost>;
}

const toMeta = (revision: Revision): RevisionMeta => ({
  id: revision.id,
  documentId: revision.documentId,
  createdAt: iso(revision.createdAt),
});

/** Normalise a stored record and attach the revision metadata it owns. */
function hydrate(
  post: Post,
  revisions: RevisionMeta[],
  options: { withData: boolean },
): Post {
  const { data, ...rest } = post;
  return {
    ...rest,
    createdAt: iso(post.createdAt),
    updatedAt: iso(post.updatedAt),
    revisions,
    ...(options.withData ? { data } : {}),
  };
}

async function readPost(id: string): Promise<Post | undefined> {
  const stored = await postDB.getByID(id) as Post | undefined;
  if (!stored) return undefined;
  const revisions = await revisionDB.getManyByKey("documentId", stored.id);
  return hydrate(stored, revisions.map(toMeta), { withData: true });
}

export const localBackend: PostBackend = {
  async list() {
    const [posts, revisions] = await Promise.all([
      postDB.getAll(),
      revisionDB.getAll(),
    ]);
    const byPost = new Map<string, RevisionMeta[]>();
    for (const revision of revisions) {
      const list = byPost.get(revision.documentId);
      if (list) list.push(toMeta(revision));
      else byPost.set(revision.documentId, [toMeta(revision)]);
    }
    // Content is omitted here so the store stays light — `get` loads it on demand.
    return posts.map((post) =>
      hydrate(post, byPost.get(post.id) ?? [], { withData: false })
    );
  },

  async get(id) {
    const stored = isUuid(id)
      ? await postDB.getByID(id) as Post | undefined
      : await postDB.getOneByKey("handle", id);
    if (!stored) return undefined;
    const revisions = await revisionDB.getManyByKey("documentId", stored.id);
    return hydrate(stored, revisions.map(toMeta), { withData: true });
  },

  async children(id) {
    const posts = await postDB.getAll();
    return posts
      .filter((post) => post.parentId === id)
      .map((post) => hydrate(post, [], { withData: false }))
      .sort((a, b) => (a.rank ?? "") < (b.rank ?? "") ? -1 : 1);
  },

  async create(input: PostCreateInput) {
    const { revisions, ...post } = input;
    await postDB.add(toStored(post) as Post);
    if (revisions?.length) await revisionDB.addMany(revisions);
    const created = await readPost(input.id);
    if (!created) throw new Error("failed to create post");
    return created;
  },

  async update(id, partial: PostUpdateInput) {
    const { revisions, ...post } = partial;
    await postDB.patch(id, toStored(post));
    if (revisions?.length) await revisionDB.addMany(revisions);
    const updated = await readPost(id);
    if (!updated) throw new Error("failed to update post");
    return updated;
  },

  async delete(id) {
    await postDB.deleteByID(id);
    await revisionDB.deleteManyByKey("documentId", id);
    return id;
  },

  async move({ id, destination, rank }: MovePostArg & { rank: string }) {
    // Container exclusivity mirrors the server: a series destination wins over
    // a parent, so the two backends can never disagree about where a post lives.
    const seriesId = destination.seriesId ?? null;
    const parentId = seriesId ? null : (destination.parentId ?? null);
    await postDB.patch(id, { rank, seriesId, parentId });
    const moved = await readPost(id);
    if (!moved) throw new Error("failed to move post");
    return moved;
  },

  revisions: {
    async get(id) {
      const revision = await revisionDB.getByID(id) as Revision | undefined;
      if (!revision) return undefined;
      return { ...revision, createdAt: iso(revision.createdAt) };
    },

    async create(revision: Revision) {
      // `put` rather than `add`: re-saving the same head is a no-op instead of
      // an error, matching the cloud route's upsert.
      await revisionDB.update(revision);
      return toMeta(revision);
    },

    async delete(id, documentId) {
      await revisionDB.deleteByID(id);
      return { id, documentId };
    },
  },
};
