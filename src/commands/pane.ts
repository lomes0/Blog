import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { MAX_PANES } from "@/types";
import { commandFailed, commandOk, defineCommand } from "./types";

/**
 * The workspace's viewports, as things the user *and* the agent can address.
 *
 * These are the Phase 5 half of the registry (plan §3.3). They are `read`
 * commands: splitting, closing, focusing and flipping read/write change what is
 * on screen, never what is stored — so they run on arrival rather than through
 * the proposal path, which has nothing to preview.
 *
 * All four reach the store by dynamic import, for the reason spelled out in
 * `ui.ts`: `api/copilot/route.ts` derives its tool schemas from this module
 * graph on the server, and `@/store` pulls in IndexedDB.
 */
const storeModule = () => import("@/store");

/** As in `document.ts` — `/edit/[id]` takes an id or a handle, so this does. */
const documentRef = z.string().min(1);

/**
 * A document id for a reference that may be a handle.
 *
 * Panes are keyed by document id (Phase 4 made that an invariant at the deep-
 * link seam), so a handle has to be resolved before it can become one. Returns
 * the input unchanged when the post is not in the store — the caller then hands
 * it to the routing seam, which does the cold-load fetch.
 */
async function resolveDocumentId(ref: string): Promise<string> {
  const { postsSelectors, store } = await storeModule();
  const state = store.getState();
  if (postsSelectors.selectById(state, ref)) return ref;
  const lowered = ref.toLowerCase();
  const byHandle = postsSelectors.selectAll(state).find(
    (post) => post.handle?.toLowerCase() === lowered,
  );
  return byHandle?.id ?? ref;
}

const splitParams = z.object({
  id: documentRef,
  /** Defaults to `write`. A reference pane alongside a draft wants `read`. */
  mode: z.enum(["read", "write"]).optional(),
});
type PaneSplitParams = z.infer<typeof splitParams>;

const split = defineCommand<PaneSplitParams>({
  id: "pane.split",
  title: "Open to the side",
  description:
    "Open a second pane beside the current one, showing the given post. " +
    "Two panes is the maximum. A post can only be open in one pane, so " +
    "splitting onto a post that is already open just focuses the pane it is " +
    "in. Use workspace.describe to see what is open.",
  params: splitParams,
  effect: "read",
  scopes: ["workspace", "document"],
  // A pane can only be split off an open workspace; panes exist only while the
  // editor is mounted.
  available: (ctx) => ctx.workspace.panes.length > 0,
  run: async (ctx, { id, mode = "write" }) => {
    if (ctx.workspace.panes.length >= MAX_PANES) {
      return commandFailed(
        `Already showing ${MAX_PANES} panes. Close one first.`,
      );
    }
    const { actions } = await storeModule();
    const rootId = await resolveDocumentId(id);
    const alreadyOpen = ctx.workspace.panes.some((p) => p.docId === rootId);
    // The reducer decides either way — see the duplicate-open guard in
    // `openPane`. This only chooses which sentence to say about it.
    ctx.dispatch(actions.openPane({ paneId: uuidv4(), rootId, mode }));
    // And that is the whole command: **no navigation**. It used to push
    // `/edit/<rootId>` afterwards, because the split pane is the focused one
    // and, while the URL was a projection of focus, the URL was also what
    // decided focus on a cold load — without the push a reload restored both
    // panes and then focused the wrong one. `focusedPaneId` is in the stored
    // record and always was, so that push was repairing damage the URL replay
    // itself caused (docs/plans/workspace-url.md §1.1). Splitting is a pane
    // event now, and pane events do not touch the address bar.
    return commandOk(
      alreadyOpen ? "Already open — focused that pane." : undefined,
    );
  },
});

const paneRef = z.object({
  /** Defaults to the focused pane. Ids come from `workspace.describe`. */
  paneId: z.string().min(1).optional(),
});
type PaneRefParams = z.infer<typeof paneRef>;

const close = defineCommand<PaneRefParams>({
  id: "pane.close",
  title: "Close pane",
  description:
    "Close one of the workspace's panes, leaving the other. Defaults to the " +
    "focused pane. The last remaining pane cannot be closed — that is what " +
    "leaving the editor does.",
  params: paneRef,
  effect: "read",
  scopes: ["workspace"],
  available: (ctx) => ctx.workspace.panes.length > 1,
  run: async (ctx, { paneId }) => {
    const target = paneId ?? ctx.workspace.panes.find((p) => p.focused)?.id;
    if (!target) return commandFailed("No pane is focused.");
    if (!ctx.workspace.panes.some((p) => p.id === target)) {
      return commandFailed(`No pane ${target} is open.`);
    }
    const { actions } = await storeModule();
    // The whole command. It used to be followed by a `rewrite` to whatever pane
    // inherited focus, because the address bar still named the pane that had
    // just been closed and the focus projection deliberately declined to repair
    // that case. With the URL consumed on entry (docs/plans/workspace-url.md
    // §3) the address bar is `/edit` before and after, so **closing a pane is
    // not a URL event** — and the dynamic `layoutSelectors` import that read
    // the surviving focus back went with it.
    ctx.dispatch(actions.closePane(target));
    return commandOk();
  },
});

const maximize = defineCommand<PaneRefParams>({
  id: "pane.maximize",
  title: "Maximize pane",
  description:
    "Give one pane the whole row, hiding the other without closing it. " +
    "Defaults to the focused pane. Run it again on a maximized pane — or " +
    "press Escape — to bring the split back. Nothing is unloaded: the hidden " +
    "pane keeps its document, its scroll position and its undo history.",
  params: paneRef,
  effect: "read",
  scopes: ["workspace"],
  // Meaningless with one pane: it already fills the row.
  available: (ctx) => ctx.workspace.panes.length > 1,
  run: async (ctx, { paneId }) => {
    const target = paneId ?? ctx.workspace.panes.find((p) => p.focused)?.id;
    if (!target) return commandFailed("No pane is focused.");
    if (!ctx.workspace.panes.some((p) => p.id === target)) {
      return commandFailed(`No pane ${target} is open.`);
    }
    const { actions } = await storeModule();
    ctx.dispatch(actions.toggleMaximizePane(target));
    return commandOk();
  },
});

const focusParams = z.object({
  paneId: z.string().min(1),
});
type PaneFocusParams = z.infer<typeof focusParams>;

const focus = defineCommand<PaneFocusParams>({
  id: "pane.focus",
  title: "Focus pane",
  description:
    "Make a pane the focused one. The focused pane is what 'this document' " +
    "means: the toolbar, the right rail, the breadcrumb and the Copilot all " +
    "follow it. Ids come from workspace.describe.",
  params: focusParams,
  effect: "read",
  scopes: ["workspace"],
  run: async (ctx, { paneId }) => {
    if (!ctx.workspace.panes.some((p) => p.id === paneId)) {
      return commandFailed(`No pane ${paneId} is open.`);
    }
    const { actions } = await storeModule();
    ctx.dispatch(actions.focusPane(paneId));
    return commandOk();
  },
});

const modeParams = z.object({
  mode: z.enum(["read", "write"]),
  /** Defaults to the focused pane. */
  paneId: z.string().min(1).optional(),
});
type PaneModeParams = z.infer<typeof modeParams>;

/**
 * The line that replaces `router.push('/view/…' | '/edit/…')` (plan §4.4).
 *
 * Read mode is now the same pane, the same Lexical instance and the same scroll
 * offset with `editor.setEditable(false)` — so toggling it costs nothing and
 * loses nothing. `/view/[id]` keeps its old meaning, unchanged: the public,
 * store-free, shareable page.
 */
const setMode = defineCommand<PaneModeParams>({
  id: "pane.setMode",
  title: "Set pane mode",
  description:
    "Show a pane's document for reading or for editing. This does not " +
    "navigate: the same editor stays mounted and only becomes read-only, so " +
    "scroll position and undo history survive.",
  params: modeParams,
  effect: "read",
  scopes: ["workspace", "document"],
  available: (ctx) => ctx.workspace.panes.length > 0,
  run: async (ctx, { mode, paneId }) => {
    const target = paneId ?? ctx.workspace.panes.find((p) => p.focused)?.id;
    if (!target) return commandFailed("No pane is focused.");
    if (!ctx.workspace.panes.some((p) => p.id === target)) {
      return commandFailed(`No pane ${target} is open.`);
    }
    const { actions } = await storeModule();
    ctx.dispatch(actions.setPaneMode({ paneId: target, mode }));
    return commandOk();
  },
});

export const paneCommands = {
  split,
  close,
  maximize,
  focus,
  setMode,
} as const;
