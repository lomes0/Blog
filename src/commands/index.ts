/**
 * The command registry — one description of "what this app can do", shared by
 * the ⌘K palette, the UI's own buttons, and (from Phase 3) the Copilot's tools.
 *
 * See docs/plans/workspace-panes.md §3. Two rules keep it worth having:
 *
 * 1. **Commands are entities, never URLs.** There is no `navigate(href)`. A
 *    route only appears inside a command body, so Phase 4 can move every page
 *    without touching a call site — and the AI can never learn a path shape it
 *    would then freeze in place.
 * 2. **`run` is not a hook.** A command takes a plain `CommandContext`, so the
 *    Phase 3 tool executor can call exactly what a button calls.
 */
import { documentCommands } from "./document";
import { seriesCommands } from "./series";
import { uiCommands } from "./ui";
import { workspaceCommands } from "./workspace";
import type { ErasedCommand } from "./types";

export * from "./types";
export { documentCommands, seriesCommands, uiCommands, workspaceCommands };

/**
 * Every command, type-erased so they fit in one list.
 *
 * Phase 3 maps this to the Copilot's tool list via zod → JSON Schema, which is
 * what makes "you cannot ship a feature the AI can't call" structural rather
 * than a habit.
 */
export const commandRegistry: readonly ErasedCommand[] = [
  ...Object.values(documentCommands),
  ...Object.values(seriesCommands),
  ...Object.values(uiCommands),
  ...Object.values(workspaceCommands),
];
