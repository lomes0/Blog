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
   * (docs/plans/ordering-simplification.md §4, decided) — where in the
   * destination it lands is the container's order array, written separately.
   */
  move(arg: MovePostArg): Promise<Post>;

  /**
   * Persist the order of a container's children.
   *
   * The cloud writes the array on the container that owns it and is done. The
   * local library has no such row — IndexedDB holds posts and nothing else, so
   * there is no `User` to hang a `rootOrder` on (§7 is not this phase) — so it
   * rewrites the posts' `rank` keys to match the array instead, and returns
   * what it wrote so the store's copies agree with storage.
   */
  reorder(orderedIds: string[]): Promise<{ id: string; rank: string }[]>;

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
 */
export function toCreateInput(
  post: Post,
  overrides: Partial<PostCreateInput> = {},
): PostCreateInput {
  const {
    author: _author,
    coauthors: _coauthors,
    revisions: _revisions,
    ...rest
  } = post;
  return { ...rest, ...overrides };
}

export { cloudBackend, localBackend };
