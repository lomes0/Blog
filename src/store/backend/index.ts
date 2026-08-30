import type { TreeContainer } from "@/lib/tree/model";
import type {
  MovePostArg,
  Post,
  PostCreateInput,
  PostUpdateInput,
  Revision,
  RevisionMeta,
  User,
} from "@/types";
import { cloudBackend } from "./cloud";
import { localBackend } from "./local";

/**
 * Storage for the current session's posts.
 *
 * Two implementations — {@link cloudBackend} (PostgreSQL via `/api/*`) and
 * {@link localBackend} (IndexedDB) — expose the same operations, so everything
 * above this seam is written once. Which one is in play follows from the session
 * alone; see {@link backendFor}.
 */
export interface PostBackend {
  /** All posts owned by the session, without their content. */
  list(): Promise<Post[]>;
  /** One post *including* its `data`. Accepts an id or a handle. */
  get(id: string): Promise<Post | undefined>;
  /** A tabbed post's child tabs, in the parent's order, without content. */
  children(id: string): Promise<Post[]>;
  create(input: PostCreateInput): Promise<Post>;
  update(id: string, partial: PostUpdateInput): Promise<Post>;
  /** Resolves to the deleted post's id. */
  delete(id: string): Promise<string>;
  /**
   * Re-home a post into another container. **Appends** there
   * (docs/plans/archive/ordering-simplification.md §4, decided) — where in the
   * destination it lands is the container's order array, written separately.
   */
  move(arg: MovePostArg): Promise<Post>;

  /**
   * Persist the order of a container's children — the array, verbatim, on
   * whatever holds that container's order
   * (docs/plans/archive/ordering-simplification.md §4).
   *
   * One mechanism on both sides of the seam since §7 landed: the cloud writes
   * the column on the row that owns the list, the local library writes the same
   * array to IndexedDB (a keyval record for root, `tabOrder` on the post for a
   * tab strip). Neither computes anything, so neither has anything to return.
   */
  reorder(container: TreeContainer, orderedIds: string[]): Promise<void>;

  /**
   * The session's root order, when storage is where it lives.
   *
   * `null` for the cloud, whose copy arrives on the session — `session.user` is
   * the `User` row, and `rootOrder` is a column on it, so there is nothing to
   * fetch. The local library has no user row, so its root order is a record in
   * IndexedDB and this is the only way to read it (§7).
   */
  rootOrder(): Promise<string[] | null>;

  revisions: {
    /** A revision *including* its content. */
    get(id: string): Promise<Revision | undefined>;
    create(revision: Revision): Promise<RevisionMeta>;
    delete(
      id: string,
      documentId: string,
    ): Promise<{ id: string; documentId: string }>;
  };
}

/**
 * The session's backend. This is the ONLY place the local/cloud choice is made —
 * it is derived from the session on every call rather than stored on documents,
 * which is what keeps the rest of the app free of two-copy branching.
 */
export const backendFor = (user?: User | null): PostBackend =>
  user ? cloudBackend : localBackend;

/**
 * Turn an existing post into the input for creating a new one.
 *
 * Drops the fields that belong to the original rather than the copy: its author,
 * its collaborators, and its revision history. A copy is the caller's own,
 * starting a fresh history — carrying any of that over would attribute the new
 * post to the wrong people.
 *
 * `tabOrder` goes for the same reason in a different currency: it names the
 * *original's* child tabs, which the copy does not have
 * (docs/plans/archive/ordering-simplification.md §2).
 */
export function toCreateInput(
  post: Post,
  overrides: Partial<PostCreateInput> = {},
): PostCreateInput {
  const {
    author: _author,
    coauthors: _coauthors,
    revisions: _revisions,
    tabOrder: _tabOrder,
    ...rest
  } = post;
  return { ...rest, ...overrides };
}

export { cloudBackend, localBackend };
