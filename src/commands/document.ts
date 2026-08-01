import { z } from "zod";
import { commandFailed, commandOk, defineCommand } from "./types";

/**
 * `/edit/[id]` and `/view/[id]` both accept a document id *or* a handle, so
 * `id` is whichever the caller has. Callers with both should pass the handle,
 * matching what the links they sit next to already do.
 */
const documentRef = z.string().min(1);

const openParams = z.object({
  id: documentRef,
  /** Defaults to `write`, which is what every "open this post" affordance means. */
  mode: z.enum(["read", "write"]).optional(),
});
type DocumentOpenParams = z.infer<typeof openParams>;

/**
 * Since Phase 5 this drives **workspace state first** and the URL second.
 *
 * Before, it only pushed a path and let the routing seam replay it as a pane.
 * That stopped working once a second pane existed: opening a post that the
 * *other* pane is already showing has to move focus, and `router.push` of a
 * path the address bar already holds is a no-op — so the click did nothing. The
 * dispatch is what actually decides (`openPane` holds the duplicate-open
 * invariant of plan §5.2); the push only keeps the address bar honest, and
 * remains the cold-load path for a handle whose post is not in the store yet.
 *
 * `mode` is a pane mode now, not a route. `/view/[id]` is the public page and is
 * reached by links, never by this command — see plan §4.4.
 */
const open = defineCommand<DocumentOpenParams>({
  id: "document.open",
  title: "Open document",
  description:
    "Show a post in the workspace, for reading or for editing. `id` is a " +
    "document id (the same id used in the '<id>.md' paths of the file tools) " +
    "or the post's handle. A post already open in a pane is focused rather " +
    "than opened twice.",
  params: openParams,
  effect: "read",
  scopes: ["workspace", "document"],
  run: async (ctx, { id, mode = "write" }) => {
    const { actions, postsSelectors, store } = await import("@/store");
    // Panes are keyed by document id, so a handle has to be resolved before it
    // can become one. An unresolvable handle is left to the routing seam, which
    // fetches it after the navigation below.
    const lowered = id.toLowerCase();
    const rootId = postsSelectors.selectById(store.getState(), id)?.id ??
      postsSelectors.selectAll(store.getState()).find(
        (post) => post.handle?.toLowerCase() === lowered,
      )?.id;
    if (rootId) ctx.dispatch(actions.openPane({ rootId, mode }));
    ctx.router.push(`/edit/${id}`);
    return commandOk();
  },
});

/**
 * `effect: "read"` on the two commands below is not an oversight.
 *
 * Both open the create form; the write happens when that form is submitted.
 * Marking them `mutate` would put them through Phase 3's preview/accept path,
 * which has nothing to preview. They grow real parameters (and a real effect)
 * when creation stops being a page — see plan §3.3.
 */
const create = defineCommand<void>({
  id: "document.create",
  title: "New post",
  description:
    "Open the 'new post' form. This only navigates — to create a post with " +
    "content in one step, use the create_document file tool instead.",
  params: z.void(),
  effect: "read",
  scopes: ["workspace"],
  run: async (ctx) => {
    ctx.router.push("/new");
    return commandOk();
  },
});

const forkParams = z.object({
  /** The document being forked from. Id or handle, as above. */
  id: documentRef,
  /**
   * Fork from a specific revision rather than the head. Callers pass this only
   * when it differs from the document's head — `/new/[id]` already forks the
   * head when the parameter is absent.
   */
  revisionId: z.string().min(1).optional(),
});
type DocumentForkParams = z.infer<typeof forkParams>;

const fork = defineCommand<DocumentForkParams>({
  id: "document.fork",
  title: "Fork document",
  description:
    "Start a new post as a copy of an existing one, optionally from a past " +
    "revision. Opens the create form pre-filled; nothing is saved until the " +
    "user submits it.",
  params: forkParams,
  effect: "read",
  scopes: ["document"],
  run: async (ctx, { id, revisionId }) => {
    const query = revisionId ? `?v=${encodeURIComponent(revisionId)}` : "";
    ctx.router.push(`/new/${id}${query}`);
    return commandOk();
  },
});

const renameParams = z.object({
  id: documentRef,
  /** Matches the rename affordances in the UI, which also trim and require one. */
  name: z.string().trim().min(1, "A post needs a title"),
});
type DocumentRenameParams = z.infer<typeof renameParams>;

/**
 * The first `mutate` command, and the one the preview/accept path is built
 * around.
 *
 * It reaches the store by dynamic import for the reason given in `ui.ts`. The
 * write itself lands on `PATCH /api/documents/[id]` through `updatePost`, which
 * authorizes it — withholding the tool, like the route does for the content
 * write tools, is about not proposing a change that could only fail on accept.
 */
const rename = defineCommand<DocumentRenameParams>({
  id: "document.rename",
  title: "Rename document",
  description:
    "Change a post's title. Proposes the change for the user to accept; " +
    "nothing is written until they do.",
  params: renameParams,
  effect: "mutate",
  scopes: ["document"],
  preview: async (_ctx, { id, name }) => {
    const { postsSelectors, store } = await import("@/store");
    const post = postsSelectors.selectById(store.getState(), id);
    return {
      summary: post
        ? `Rename “${post.name}” to “${name}”`
        : `Rename ${id} to “${name}”`,
      detail: { id, name, previousName: post?.name ?? null },
    };
  },
  run: async (ctx, { id, name }) => {
    const { actions } = await import("@/store");
    const result = await ctx.dispatch(
      actions.updatePost({ id, partial: { name } }),
    );
    if (actions.updatePost.rejected.match(result)) {
      return commandFailed(`Could not rename ${id}.`);
    }
    return commandOk(`Renamed to “${name}”.`);
  },
});

export const documentCommands = { open, create, fork, rename } as const;
