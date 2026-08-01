import { z } from "zod";
import { actions } from "@/store";
import { commandFailed, commandOk, defineCommand } from "./types";
import { documentCommands } from "./document";

const toggleSidebar = defineCommand<void>({
  id: "ui.toggleSidebar",
  title: "Toggle sidebar",
  params: z.void(),
  effect: "read",
  scopes: ["workspace"],
  run: async (ctx) => {
    ctx.dispatch(actions.toggleDrawer());
    return commandOk();
  },
});

const toggleCopilot = defineCommand<void>({
  id: "ui.toggleCopilot",
  title: "Toggle AI assistant",
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
