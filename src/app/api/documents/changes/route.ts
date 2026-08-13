import { userRoute } from "@/lib/api-utils";
import { findDocumentIdsByAuthorId } from "@/repositories/document";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The catch-up query — docs/plans/archive/changes-detection.md §3.
 *
 * Every document the caller owns, as `{ id, updatedAt }`. The client diffs this
 * against its store (`src/lib/changes/diff.ts`) to learn what it missed: a new
 * id is a create, a newer timestamp an update, and an id it holds that is
 * *absent* here is a delete — the one thing a `since=` cursor could never
 * report, because `Document` has no `deletedAt` (§3.1).
 *
 * **`userRoute`, scoped to `user.id`, and it takes no id parameter.** There is
 * no form of this endpoint that answers for anyone but the caller: an id
 * argument would turn a background refresh into an enumeration of someone
 * else's library. The same reasoning as `GET /api/proposals/count`, and the
 * same reason it is not `publicRoute` — `grep -rn "publicRoute" src/app/api`
 * stays the complete list of unauthenticated surfaces (CLAUDE.md).
 *
 * A static segment, so it resolves ahead of `[id]` — as `check/`, `new/` and
 * `update-times/` already do; there is no document whose id is "changes".
 */
export const GET = userRoute(
  async (_request, { user }) => {
    const ids = await findDocumentIdsByAuthorId(user.id);
    return NextResponse.json({ data: { ids } });
  },
  { errorLabel: "Error listing document changes" },
);
