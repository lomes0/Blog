import { z } from "zod";
import { commandOk, defineCommand } from "./types";

const seriesRef = z.object({ id: z.string().min(1) });
type SeriesRefParams = z.infer<typeof seriesRef>;

/**
 * A series' posts live at `/posts/[seriesId]`, not `/series/[id]` — that route
 * is a 308 to this one and has been since the rename (plan §4.5). Callers that
 * used to push `/series/[id]` and take the redirect land here directly.
 */
const open = defineCommand<SeriesRefParams>({
  id: "series.open",
  title: "Open series",
  description:
    "Show the posts belonging to a series. `id` is a series id — the same id " +
    "the list_documents tool reports as a post's series.",
  params: seriesRef,
  effect: "read",
  scopes: ["workspace", "series"],
  run: async (ctx, { id }) => {
    ctx.router.push(`/posts/${id}`);
    return commandOk();
  },
});

/** The series' own settings form — title, description, creation date, delete. */
const edit = defineCommand<SeriesRefParams>({
  id: "series.edit",
  title: "Edit series settings",
  description:
    "Open a series' settings form — its title, description and deletion. " +
    "This navigates; the user makes the change.",
  params: seriesRef,
  effect: "read",
  scopes: ["series"],
  run: async (ctx, { id }) => {
    ctx.router.push(`/series/${id}/edit`);
    return commandOk();
  },
});

export const seriesCommands = { open, edit } as const;
