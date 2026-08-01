import { z } from "zod";
import { commandOk, defineCommand } from "./types";

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

const open = defineCommand<DocumentOpenParams>({
  id: "document.open",
  title: "Open document",
  params: openParams,
  effect: "read",
  scopes: ["workspace", "document"],
  run: async (ctx, { id, mode = "write" }) => {
    ctx.router.push(mode === "read" ? `/view/${id}` : `/edit/${id}`);
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
  params: forkParams,
  effect: "read",
  scopes: ["document"],
  run: async (ctx, { id, revisionId }) => {
    const query = revisionId ? `?v=${encodeURIComponent(revisionId)}` : "";
    ctx.router.push(`/new/${id}${query}`);
    return commandOk();
  },
});

export const documentCommands = { open, create, fork } as const;
