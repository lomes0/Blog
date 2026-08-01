import { z } from "zod";
import { commandOk, defineCommand } from "./types";

/**
 * The app's named surfaces. A **closed enum, not a URL** — plan §3.2 rules out
 * a `navigate(href)` command precisely so routes can be reorganised in Phase 4
 * without anything above the registry noticing, and an enum of destinations is
 * the version of "go there" that survives that.
 */
const sectionParams = z.object({
  section: z.enum(["library", "notes", "dashboard"]),
});
type WorkspaceSectionParams = z.infer<typeof sectionParams>;

const SECTION_PATH: Record<WorkspaceSectionParams["section"], string> = {
  library: "/posts",
  notes: "/notes",
  dashboard: "/dashboard",
};

const openSection = defineCommand<WorkspaceSectionParams>({
  id: "workspace.openSection",
  title: "Go to section",
  params: sectionParams,
  effect: "read",
  scopes: ["workspace"],
  run: async (ctx, { section }) => {
    ctx.router.push(SECTION_PATH[section]);
    return commandOk();
  },
});

export const workspaceCommands = { openSection } as const;
