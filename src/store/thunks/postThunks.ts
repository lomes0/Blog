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
import { rankAtEnd, rankBetween, type Ranked } from "@/lib/ordering";
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

/** A tabbed post's child tabs, rank-ordered, without their content. */
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
    const head = uuidv4();
    const data = source.data ?? EMPTY_EDITOR_STATE;
    return await backend.create(toCreateInput(source, {
      id: arg.newId,
      name: arg.newName,
      handle: null, // handles are unique; the copy earns its own
      rank: null, // appended to its container rather than tying with the source
      head,
      createdAt: now,
      updatedAt: now,
      data,
      revisions: [{ id: head, documentId: arg.newId, createdAt: now, data }],
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
        if (!revisionId || revisionId === own.head) return own;
        const revision = await backend.revisions.get(revisionId);
        if (!revision) fail("revision not found");
        return {
          ...own,
          head: revision.id,
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

// ─── Move / reorder ──────────────────────────────────────────────────────────

/**
 * Ranks of a container's current members, read from Redux. Root mixes standalone
 * posts and series in one rank space, mirroring the server.
 */
function containerSiblings(
  state: AppState,
  destination: MovePostArg["destination"],
  excludeId: string,
): Ranked[] {
  const seriesId = destination.seriesId ?? null;
  const parentId = seriesId ? null : (destination.parentId ?? null);
  const out: Ranked[] = [];
  for (const post of Object.values(state.posts.entities)) {
    if (!post || post.id === excludeId || post.rank == null) continue;
    const postSeries = post.seriesId ?? null;
    const postParent = post.parentId ?? null;
    const inContainer = seriesId
      ? postSeries === seriesId
      : parentId
      ? postParent === parentId
      : !postSeries && !postParent;
    if (inContainer) out.push({ id: post.id, rank: post.rank });
  }
  if (!seriesId && !parentId) {
    for (const s of state.series) {
      if (s.rank != null) out.push({ id: s.id, rank: s.rank });
    }
  }
  return out;
}

/**
 * The rank a moved post should take, computed client-side. Deterministic, so it
 * matches what the server derives for positioned moves — which is what lets the
 * move be applied optimistically and lets the local backend reorder with no
 * server at all.
 */
function moveRank(state: AppState, arg: MovePostArg): string {
  const { afterRank, beforeRank } = arg.between ?? {};
  if (afterRank != null || beforeRank != null) {
    return rankBetween(afterRank ?? null, beforeRank ?? null);
  }
  return rankAtEnd(containerSiblings(state, arg.destination, arg.id));
}

/**
 * Optimistically set a post's rank so a reorder feels instant. The backend's
 * response (identical for positioned moves) confirms it on fulfilment. No
 * rollback by design — a failed reorder settles on the next load.
 */
export const applyPostRank = createAction<{ id: string; rank: string }>(
  "app/applyPostRank",
);

export const movePost = createApiThunk(
  "app/movePost",
  async (arg: MovePostArg, thunkAPI) => {
    const rank = moveRank(thunkAPI.getState(), arg);
    thunkAPI.dispatch(applyPostRank({ id: arg.id, rank }));
    return await backendOf(thunkAPI.getState).move({ ...arg, rank });
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

    const createTab = async (name: string, data: SerializedEditorState) => {
      const now = new Date().toISOString();
      const id = uuidv4();
      const head = uuidv4();
      await backend.create({
        id,
        name,
        head,
        createdAt: now,
        updatedAt: now,
        type: "DOCUMENT",
        parentId: targetId,
        data,
        revisions: [{ id: head, documentId: id, createdAt: now, data }],
      });
    };

    for (const sourceId of sourceIds) {
      const source = await backend.get(sourceId);
      if (!source) continue;

      // Flatten: the source's own child tabs become siblings too.
      const childStubs = await backend.children(sourceId);

      await createTab(source.name, source.data ?? EMPTY_EDITOR_STATE);
      for (const stub of childStubs) {
        const child = await backend.get(stub.id);
        if (!child) continue;
        await createTab(
          child.name ?? stub.name,
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
