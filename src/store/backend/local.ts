import { getStore, type LocalOrder } from "@/indexeddb";
import { orderBy, withIds, withoutIds } from "@/lib/orderArray";
import type { TreeContainer } from "@/lib/tree/model";
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
const orderDB = getStore<LocalOrder>("orders");

/** IndexedDB round-trips `Date`s; the store keeps timestamps as ISO strings. */
const iso = (value: string | Date): string =>
  value instanceof Date ? value.toISOString() : value;

/** What actually lands in the `documents` store. */
type StoredPost = Omit<
  Post,
  "author" | "coauthors" | "published" | "collab" | "private" | "series"
>;

/**
 * Where a guest's container orders live
 * (docs/plans/archive/ordering-simplification.md §7).
 *
 * A tabbed post's order is `tabOrder` on the post record, exactly as it is on
 * the `Document` row in the cloud. Root is the one container with no row of its
 * own — the cloud hangs it on `User` and there is no user here — so it is a
 * keyval record in the `orders` store, under this key.
 */
const ROOT_ORDER_KEY = "root";

/**
 * The stored order of a local container; `[]` when it has never been written.
 *
 * A guest has no series and no projects, so those two container kinds cannot
 * arise here. They answer `[]` rather than throwing: the ordering surfaces are
 * shared with the signed-in ones, and a guest reaching one of them should be a
 * no-op, not an error.
 */
async function readLocalOrder(container: TreeContainer): Promise<string[]> {
  if (container.type === "tabs") {
    const parent = await postDB.getByID(container.parentId) as Post | undefined;
    return parent?.tabOrder ?? [];
  }
  if (container.type !== "root") return [];
  const record = await orderDB.getByID(ROOT_ORDER_KEY) as
    | LocalOrder
    | undefined;
  return record?.ids ?? [];
}

/** Persist a local container's order. See {@link readLocalOrder} on kinds. */
async function writeLocalOrder(
  container: TreeContainer,
  ids: string[],
): Promise<void> {
  if (container.type === "tabs") {
    await postDB.patch(container.parentId, { tabOrder: ids });
    return;
  }
  if (container.type !== "root") return;
  await orderDB.update({ id: ROOT_ORDER_KEY, ids });
}

/** The container a local post is in: a guest's posts are root posts or tabs. */
const containerOfPost = (
  post: { parentId?: string | null },
): TreeContainer =>
  post.parentId ? { type: "tabs", parentId: post.parentId } : { type: "root" };

/** Put `id` into its container's array (the create / re-home half of §6). */
async function addToLocalOrder(
  container: TreeContainer,
  id: string,
  at: "start" | "end",
): Promise<void> {
  const current = await readLocalOrder(container);
  const next = withIds(current, [id], at);
  if (next.length !== current.length) await writeLocalOrder(container, next);
}

/**
 * Drop `id` from every local array that could name it (the delete half of §6).
 *
 * Every array rather than the one it lived in, because a delete is also the
 * path where the row is already gone by the time anyone asks where it was.
 */
async function forgetFromLocalOrders(id: string): Promise<void> {
  const root = await readLocalOrder({ type: "root" });
  if (root.includes(id)) {
    await writeLocalOrder({ type: "root" }, withoutIds(root, [id]));
  }
  for (const post of await postDB.getAll()) {
    if (post.tabOrder?.includes(id)) {
      const tabOrder = withoutIds(post.tabOrder, [id]);
      await postDB.patch(post.id, { tabOrder });
    }
  }
}

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
  // Where in the container to land, not where it is: consumed by `create`.
  "placement",
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
    const [posts, parent] = await Promise.all([
      postDB.getAll(),
      postDB.getByID(id) as Promise<Post | undefined>,
    ]);
    const children = posts
      .filter((post) => post.parentId === id)
      .map((post) => hydrate(post, [], { withData: false }));
    return orderBy(parent?.tabOrder ?? [], children);
  },

  async create(input: PostCreateInput) {
    const { revisions, ...post } = input;
    // Every record carries a `tabOrder`, empty until the post has tabs, so the
    // stored shape matches the cloud's `Document.tabOrder @default([])`. An
    // incoming one is not trusted: it would be the *original's* child ids on a
    // duplicate (`toCreateInput` drops it for that reason).
    const stored = { ...toStored(post), tabOrder: post.tabOrder ?? [] };
    await postDB.add(stored as Post);
    if (revisions?.length) await revisionDB.addMany(revisions);
    // Its container's array gains the id, at the end it was asked for
    // (docs/plans/archive/ordering-simplification.md §6, "Create"). The cloud
    // does the same thing in `createDocument`; this is the guest's half of it.
    await addToLocalOrder(
      containerOfPost(post),
      input.id,
      input.placement === "start" ? "start" : "end",
    );
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
    await forgetFromLocalOrders(id);
    return id;
  },

  async move({ id, destination }: MovePostArg) {
    // Container exclusivity mirrors the server: a series destination wins over
    // a parent, so the two backends can never disagree about where a post lives.
    const seriesId = destination.seriesId ?? null;
    const parentId = seriesId ? null : (destination.parentId ?? null);
    await postDB.patch(id, { seriesId, parentId });
    // Both ends of the move, as `movePost` does them server-side: the container
    // it leaves loses the id, the one it joins appends it (§4, "appends only").
    await forgetFromLocalOrders(id);
    await addToLocalOrder(containerOfPost({ parentId }), id, "end");
    const moved = await readPost(id);
    if (!moved) throw new Error("failed to move post");
    return moved;
  },

  /**
   * A guest's reorder: the array, stored verbatim, exactly as the cloud stores
   * it on the container that owns the list
   * (docs/plans/archive/ordering-simplification.md §7).
   *
   * Ids with no local post are dropped rather than persisted — the caller is a
   * surface shared with the signed-in library, and a stored id naming nothing
   * is drift the tolerant reader would have to ignore on every read.
   */
  async reorder(container: TreeContainer, orderedIds: string[]) {
    const known = new Set((await postDB.getAll()).map((post) => post.id));
    await writeLocalOrder(container, orderedIds.filter((id) => known.has(id)));
  },

  /** A guest's root list, as stored. Empty until the first create. */
  async rootOrder() {
    return await readLocalOrder({ type: "root" });
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
