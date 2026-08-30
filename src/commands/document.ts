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
 * The workspace's own address, and its steady state.
 *
 * `/edit/<id>` is a door in, not a place to stay: the seam in `WorkspacePanes`
 * consumes it on arrival and replaces it with this
 * (docs/plans/archive/workspace-url.md §3).
 */
const WORKSPACE_ROUTE = "/edit";

/**
 * Is the workspace already on screen?
 *
 * `/edit/<id>` counts. It is an entry the seam is in the middle of consuming, so
 * the address bar is about to read `/edit` on its own; pushing across that
 * window would spend a history entry on an open that is not a navigation. The
 * `window` guard is for the Copilot's executor, which nothing structurally
 * stops running where there is no location.
 */
const inWorkspace = (): boolean => {
  if (typeof window === "undefined") return false;
  const { pathname } = window.location;
  return pathname === WORKSPACE_ROUTE ||
    pathname.startsWith(`${WORKSPACE_ROUTE}/`);
};

/**
 * Drives **workspace state**, and navigates only when it has to.
 *
 * Three branches, and they are docs/plans/archive/workspace-url.md §3.2
 * verbatim:
 *
 * ```
 * dispatch openPane if the ref resolves
 *   ├─ resolved + already on /edit  → nothing else
 *   ├─ resolved + elsewhere         → router.push("/edit")
 *   └─ unresolved (cold handle)     → router.push(`/edit/${id}`), seam fetches
 * ```
 *
 * The dispatch is what actually decides — `openPane` holds the duplicate-open
 * invariant of workspace-panes.md §5.2, which is why opening a post the *other*
 * pane already shows moves focus rather than opening it twice. It used to be
 * followed unconditionally by a `push` of `/edit/<id>`, keeping the address bar
 * on the focused document; the URL is an entry point now, so the only pushes
 * left are the two that genuinely have somewhere to go. The common case — an
 * open from inside the workspace — is **zero** navigations and zero history
 * entries.
 *
 * The third branch is why the route keeps its optional catch-all. A handle for
 * a post that is not in the store cannot be resolved to a pane's `rootId` here,
 * so the id has to travel through the URL to reach the seam, which fetches it
 * and then consumes the URL exactly as it would a cold deep link.
 *
 * `mode` is a pane mode, not a route. `/view/[id]` is the public page and is
 * reached by links, never by this command — see workspace-panes.md §4.4.
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
    // can become one. An unresolvable handle is the third branch: it is left to
    // the routing seam, which fetches it after the navigation.
    const lowered = id.toLowerCase();
    const rootId = postsSelectors.selectById(store.getState(), id)?.id ??
      postsSelectors.selectAll(store.getState()).find(
        (post) => post.handle?.toLowerCase() === lowered,
      )?.id;
    if (!rootId) {
      ctx.router.push(`${WORKSPACE_ROUTE}/${id}`);
      return commandOk();
    }
    ctx.dispatch(actions.openPane({ rootId, mode }));
    if (!inWorkspace()) ctx.router.push(WORKSPACE_ROUTE);
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
    "content in one step, use the create_post tool instead.",
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
  /**
   * Matches the rename affordances in the UI, which also trim and require one.
   *
   * `title`, not `name`, since docs/plans/schema-organization.md §C: it is the
   * spelling the model uses and the one `rename_post` on the MCP side already
   * took, so the app's two agent surfaces now name the same field the same way.
   */
  title: z.string().trim().min(1, "A post needs a title"),
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
  preview: async (_ctx, { id, title }) => {
    const { postsSelectors, store } = await import("@/store");
    const post = postsSelectors.selectById(store.getState(), id);
    return {
      summary: post
        ? `Rename “${post.title}” to “${title}”`
        : `Rename ${id} to “${title}”`,
      detail: { id, title, previousTitle: post?.title ?? null },
    };
  },
  run: async (ctx, { id, title }) => {
    const { actions } = await import("@/store");
    const result = await ctx.dispatch(
      actions.updatePost({ id, partial: { title } }),
    );
    if (actions.updatePost.rejected.match(result)) {
      return commandFailed(`Could not rename ${id}.`);
    }
    return commandOk(`Renamed to “${title}”.`);
  },
});

export const documentCommands = { open, create, fork, rename } as const;
