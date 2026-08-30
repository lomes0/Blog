import { createAction } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";
import { apiClient } from "@/api";
import { backendFor, toCreateInput } from "@/store/backend";
import {
  AppState,
  EMPTY_EDITOR_STATE,
  MovePostArg,
  Post,
  PostCreateInput,
  PostUpdateInput,
} from "@/types";
import type { SerializedEditorState } from "lexical";
import { createApiThunk, fail, ThunkFailure } from "./createApiThunk";

/** The backend for the current session — cloud when signed in, local for guests. */
const backendOf = (getState: () => AppState) => backendFor(getState().user);

// ─── Read ────────────────────────────────────────────────────────────────────

export const loadPosts = createApiThunk(
  "app/loadPosts",
  async (_, thunkAPI) => await backendOf(thunkAPI.getState).list(),
);

/** Load one post *with* its content. Accepts an id or a handle. */
export const getPost = createApiThunk(
  "app/getPost",
  async (id: string, thunkAPI) => {
    const post = await backendOf(thunkAPI.getState).get(id);
    if (!post) fail("post not found");
    return post;
  },
);

/** A tabbed post's child tabs, in the parent's `tabOrder`, without content. */
export const getPostChildren = createApiThunk(
  "app/getPostChildren",
  async (id: string, thunkAPI) =>
    await backendOf(thunkAPI.getState).children(id),
);

export const getPostById = createApiThunk(
  "app/getPostById",
  async (id: string, thunkAPI) => {
    const post = thunkAPI.getState().posts.entities[id];
    if (!post) fail("post not found");
    return post;
  },
);

// ─── Write ───────────────────────────────────────────────────────────────────

export const createPost = createApiThunk(
  "app/createPost",
  async (input: PostCreateInput, thunkAPI) =>
    await backendOf(thunkAPI.getState).create(input),
);

export const updatePost = createApiThunk(
  "app/updatePost",
  async (arg: { id: string; partial: PostUpdateInput }, thunkAPI) =>
    await backendOf(thunkAPI.getState).update(arg.id, arg.partial),
);

export const deletePost = createApiThunk(
  "app/deletePost",
  async (id: string, thunkAPI) => await backendOf(thunkAPI.getState).delete(id),
);

/**
 * Copy an existing post into a new one, content and all.
 *
 * The copy starts a fresh revision history — it is a new document, not a fork
 * that tracks its origin.
 */
export const duplicatePost = createApiThunk(
  "app/duplicatePost",
  async (arg: { id: string; newId: string; newName: string }, thunkAPI) => {
    const backend = backendOf(thunkAPI.getState);
    const source = await backend.get(arg.id);
    if (!source) fail("post not found");
    const now = new Date().toISOString();
    const headRevisionId = uuidv4();
    const data = source.data ?? EMPTY_EDITOR_STATE;
    return await backend.create(toCreateInput(source, {
      id: arg.newId,
      title: arg.newName,
      handle: null, // handles are unique; the copy earns its own
      headRevisionId,
      createdAt: now,
      updatedAt: now,
      data,
      revisions: [{ id: headRevisionId, documentId: arg.newId, createdAt: now, data }],
    }));
  },
);

/**
 * Fetch the content to seed a new post with.
 *
 * Looks in the session's own storage first; if the post isn't there it is
 * someone else's, so fall back to the public fork endpoint (which serves
 * published and collab posts to guests and members alike).
 */
export const forkPost = createApiThunk(
  "app/forkPost",
  async (arg: { id: string; revisionId?: string | null }, thunkAPI) => {
    const { id, revisionId } = arg;
    try {
      const backend = backendOf(thunkAPI.getState);
      const own = await backend.get(id);
      if (own) {
        if (!revisionId || revisionId === own.headRevisionId) return own;
        const revision = await backend.revisions.get(revisionId);
        if (!revision) fail("revision not found");
        return {
          ...own,
          headRevisionId: revision.id,
          updatedAt: revision.createdAt,
          data: revision.data,
        };
      }
    } catch (error: unknown) {
      // Not ours (or unreadable) — fall through to the public endpoint. A
      // `fail()` above is a real answer about our own copy, so it is rethrown
      // rather than retried publicly.
      if (error instanceof ThunkFailure) throw error;
      console.warn(error);
    }
    const forked = await apiClient.documents.fork(id, revisionId);
    if (!forked) fail("post not found");
    const { cloud, data } = forked as unknown as {
      cloud: Post;
      data: SerializedEditorState;
    };
    return { ...cloud, data };
  },
);

// ─── Re-home ─────────────────────────────────────────────────────────────────

/**
 * Optimistically re-home a post so a cross-container drag paints at once.
 *
 * Where it lands *within* the destination is not this action's business: the
 * order arrays say that, and the drop handler has already written them
 * (docs/plans/archive/ordering-simplification.md §4 — a re-home appends, a
 * follow-up order write positions). No rollback by design.
 */
export const applyPostContainer = createAction<
  { id: string; seriesId: string | null; parentId: string | null }
>("app/applyPostContainer");

/**
 * Move a post into another container. **Appends** there (§4, decided); pair it
 * with `setOrder` on the destination to drop it at a slot.
 */
export const movePost = createApiThunk(
  "app/movePost",
  async (arg: MovePostArg, thunkAPI) => {
    // Container exclusivity mirrors the server's: a series wins over a parent.
    const seriesId = arg.destination.seriesId ?? null;
    const parentId = seriesId ? null : (arg.destination.parentId ?? null);
    thunkAPI.dispatch(applyPostContainer({ id: arg.id, seriesId, parentId }));
    return await backendOf(thunkAPI.getState).move(arg);
  },
);

// ─── Tabs ────────────────────────────────────────────────────────────────────

/**
 * Merge several standalone posts into one tabbed post.
 *
 * The first post (`targetId`) is kept as the container — its own content becomes
 * the root tab. Each source post in `sourceIds` is copied into a new child tab
 * under the target. If a source post already has child tabs, those are
 * *flattened* in as siblings rather than nested. Once the copies exist, each
 * source post (and its former children) is deleted. Tabs are appended in the
 * order `sourceIds` is given.
 */
export const mergePostsIntoTabs = createApiThunk(
  "app/mergePostsIntoTabs",
  async (arg: { targetId: string; sourceIds: string[] }, thunkAPI) => {
    const { targetId, sourceIds } = arg;
    const backend = backendOf(thunkAPI.getState);

    const createTab = async (title: string, data: SerializedEditorState) => {
      const now = new Date().toISOString();
      const id = uuidv4();
      const headRevisionId = uuidv4();
      await backend.create({
        id,
        title,
        headRevisionId,
        createdAt: now,
        updatedAt: now,
        parentId: targetId,
        data,
        revisions: [{ id: headRevisionId, documentId: id, createdAt: now, data }],
      });
    };

    for (const sourceId of sourceIds) {
      const source = await backend.get(sourceId);
      if (!source) continue;

      // Flatten: the source's own child tabs become siblings too.
      const childStubs = await backend.children(sourceId);

      await createTab(source.title, source.data ?? EMPTY_EDITOR_STATE);
      for (const stub of childStubs) {
        const child = await backend.get(stub.id);
        if (!child) continue;
        await createTab(
          child.title ?? stub.title,
          child.data ?? EMPTY_EDITOR_STATE,
        );
      }

      // Originals go last, so nothing is lost if a copy fails midway.
      for (const stub of childStubs) {
        await thunkAPI.dispatch(deletePost(stub.id));
      }
      await thunkAPI.dispatch(deletePost(sourceId));
    }

    return { targetId };
  },
);
