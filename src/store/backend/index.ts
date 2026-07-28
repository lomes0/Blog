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
  /** A tabbed post's child tabs, rank-ordered, without their content. */
  children(id: string): Promise<Post[]>;
  create(input: PostCreateInput): Promise<Post>;
  update(id: string, partial: PostUpdateInput): Promise<Post>;
  /** Resolves to the deleted post's id. */
  delete(id: string): Promise<string>;
  /**
   * Re-home and/or reorder a post.
   *
   * `rank` is computed client-side so the move can be applied optimistically.
   * The cloud backend ignores it and lets the server assign the authoritative
   * rank from `between` (the two agree by construction — same algorithm, same
   * inputs); the local backend, which has no server, applies it directly.
   */
  move(arg: MovePostArg & { rank: string }): Promise<Post>;

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
