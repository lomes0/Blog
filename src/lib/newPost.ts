import { v4 as uuidv4 } from "uuid";
import type { PostCreateInput } from "@/types";
import { getEditorData } from "@/utils/getEditorData";

/** The title a post is born with when its surface never asked for one. */
export const UNTITLED_POST = "Untitled Document";

/**
 * Assemble the payload that creates a post.
 *
 * Every creation surface has to mint the same four things a caller cannot
 * sensibly supply — the post id, its first revision id, an empty editor state
 * and the twin timestamps — and getting any of them wrong produces a post that
 * looks created but cannot be opened. That is one fact, so it lives in one
 * place: the form-driven surfaces (`/new`, the create-post drawer) pass their
 * collected input as overrides, and the sidebar's one-click "+" passes nothing
 * but a container and a name.
 *
 * The caller reads the minted `id` back off the returned payload — there is no
 * second source of it to drift from.
 */
export function buildPostCreateInput(
  overrides: Partial<PostCreateInput> = {},
): PostCreateInput {
  const now = new Date().toISOString();
  return {
    ...overrides,
    id: overrides.id ?? uuidv4(),
    headRevisionId: overrides.headRevisionId ?? uuidv4(),
    title: overrides.title || UNTITLED_POST,
    data: overrides.data ?? getEditorData(),
    parentId: overrides.parentId ?? null,
    seriesId: overrides.seriesId ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}
