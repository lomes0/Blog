import { z } from "zod";
import { commandData, commandOk, defineCommand } from "./types";

/**
 * The app's named surfaces. A **closed enum, not a URL** — plan §3.2 rules out
 * a `navigate(href)` command precisely so routes can be reorganised in Phase 4
 * without anything above the registry noticing, and an enum of destinations is
 * the version of "go there" that survives that.
 */
const sectionParams = z.object({
  section: z.enum(["library", "dashboard"]),
});
type WorkspaceSectionParams = z.infer<typeof sectionParams>;

const SECTION_PATH: Record<WorkspaceSectionParams["section"], string> = {
  library: "/posts",
  dashboard: "/dashboard",
};

const openSection = defineCommand<WorkspaceSectionParams>({
  id: "workspace.openSection",
  title: "Go to section",
  description:
    "Show one of the app's top-level surfaces: the post library or the " +
    "dashboard.",
  params: sectionParams,
  effect: "read",
  scopes: ["workspace"],
  run: async (ctx, { section }) => {
    ctx.router.push(SECTION_PATH[section]);
    return commandOk();
  },
});

/**
 * What is open, so the model can say "the document in the left pane" (plan §6.2).
 *
 * The reason this is a command rather than a field on every request: pane ids
 * are stable, so an answer given once stays true for the rest of the
 * conversation, and the model can re-read it after a `document.open` without
 * the client having to decide when to volunteer it.
 */
const describe = defineCommand<void>({
  id: "workspace.describe",
  title: "Describe the workspace",
  description:
    "List the panes that are currently open, with the document each one is " +
    "showing, its title, whether it is in read or write mode, and which pane " +
    "has focus. Call this before acting on 'this document' or 'the left one'.",
  params: z.void(),
  effect: "read",
  scopes: ["workspace"],
  run: async (ctx) => commandData({ panes: ctx.workspace.panes }),
});

export const workspaceCommands = { openSection, describe } as const;
