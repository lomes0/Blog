import { z } from "zod";
import { commandFailed, commandOk, defineCommand } from "./types";
import { documentCommands } from "./document";

/**
 * The store, reached by dynamic import rather than a top-level one.
 *
 * `src/app/api/copilot/route.ts` derives its tool schemas from this registry
 * (plan §3.1), so the registry's *static* module graph is imported on the
 * server. `@/store` pulls in `@/indexeddb`, which is `"use client"` and opens a
 * browser database — nothing a route handler may reach. Keeping the edge dynamic
 * costs one microtask on a sidebar toggle and buys the whole derivation.
 *
 * Verified by `src/commands/__tests__/toolParity.test.ts`, which imports the
 * registry under `environment: "node"` and would throw if this became static.
 */
const storeActions = async () => (await import("@/store")).actions;

const toggleSidebar = defineCommand<void>({
  id: "ui.toggleSidebar",
  title: "Toggle sidebar",
  description: "Show or hide the left sidebar (the post explorer).",
  params: z.void(),
  effect: "read",
  scopes: ["workspace"],
  run: async (ctx) => {
    ctx.dispatch((await storeActions()).toggleDrawer());
    return commandOk();
  },
});

const toggleCopilot = defineCommand<void>({
  id: "ui.toggleCopilot",
  title: "Toggle AI assistant",
  description: "Show or hide the Copilot side panel.",
  params: z.void(),
  effect: "read",
  scopes: ["workspace"],
  run: async (ctx) => {
    ctx.copilot.setOpen(!ctx.copilot.open);
    return commandOk();
  },
});

const themeParams = z.object({
  mode: z.enum(["light", "dark", "system"]),
});
type UiThemeParams = z.infer<typeof themeParams>;

const setTheme = defineCommand<UiThemeParams>({
  id: "ui.setTheme",
  title: "Set color theme",
  description:
    "Switch the app between the light and dark color schemes, or follow the " +
    "operating system.",
  params: themeParams,
  effect: "read",
  scopes: ["workspace"],
  run: async (ctx, { mode }) => {
    ctx.theme.set(mode);
    return commandOk();
  },
});

const modeParams = z.object({
  mode: z.enum(["read", "write"]),
});
type UiModeParams = z.infer<typeof modeParams>;

/**
 * Read/edit switch for whatever is currently focused.
 *
 * Distinct from `document.open({ id, mode })` because it takes no id: it is the
 * ⌘E affordance, whose whole meaning is "this one, the other way". Today that
 * resolves to a navigation between `/view` and `/edit`; in Phase 5 it becomes
 * `pane.setMode` and stops navigating at all (plan §4.4). Call sites that go
 * through here need no edit when that happens.
 */
const setMode = defineCommand<UiModeParams>({
  id: "ui.setMode",
  title: "Switch read/edit mode",
  description:
    "Show the document that is currently open in reading or editing mode. " +
    "Acts on whatever is focused; use document.open to switch mode on a " +
    "specific post.",
  params: modeParams,
  effect: "read",
  scopes: ["workspace", "document"],
  available: (ctx) => ctx.focusedDocumentId !== null,
  run: async (ctx, { mode }) => {
    const id = ctx.focusedDocumentId;
    if (!id) return commandFailed("No document is open.");
    return documentCommands.open.run(ctx, { id, mode });
  },
});

export const uiCommands = {
  toggleSidebar,
  toggleCopilot,
  setTheme,
  setMode,
} as const;
