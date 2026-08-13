import { ApiError, parseBody, userRoute } from "@/lib/api-utils";
import { proposeNewPost } from "@/lib/agentWrites";
import type { WritableBlock } from "@/lib/content-bridge";
import { blockSchema } from "@/lib/content-bridge/schema";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** Server-stamped, for the same reason as the proposals route's. */
const COPILOT_ORIGIN = "copilot";

const agentPostSchema = z.object({
  // Unbounded like `documentFields.name` and like MCP's own `create_post`: a
  // ceiling here that the tool schema does not declare would be a refusal the
  // agent cannot predict.
  title: z.string().min(1),
  blocks: z.array(blockSchema).min(1),
  seriesId: z.string().optional(),
}).strict();

/**
 * Create a post as the in-app agent (docs/plans/archive/ai-surface-consolidation.md
 * §4.4.4) — the sibling of `POST /api/documents/[id]/proposals`, and the same
 * call `mcp/content-server.ts`'s `create_post` makes.
 *
 * **A create lands rather than proposing**, and that reasoning is
 * `proposeNewPost`'s, unchanged and shared: there is no `head` to withhold and
 * nothing to overwrite. It is flagged instead — `agentCreatedAt` / `agentOrigin`
 * put it in the author's Keep-or-Discard list, and `published` is false, so
 * nobody else can read it until the author publishes it (agent-gating §3.7).
 * That is the whole difference from `POST /api/documents`, which is the author
 * creating a post themselves and needs no such flag.
 *
 * Nothing to authorize beyond the session: it writes to the caller's *own*
 * library, and `proposeNewPost` scopes `seriesId` to that same author, so a post
 * cannot be filed into someone else's series.
 *
 * There is no `[id]` in the path because there is no document yet, which is why
 * this is a static segment under `/api/documents` rather than a child of one —
 * as `check`, `changes` and `update-times` already are.
 */
export const POST = userRoute(async (request, { user }) => {
  const body = await parseBody(request, agentPostSchema);

  const result = await proposeNewPost({
    authorId: user.id,
    title: body.title,
    // The same cast the two `apply_ops` callers make over the same schema: zod
    // widens a heading's `level` to `number` where the IR narrows it to 1–6.
    // The range is checked at runtime by the schema this body was parsed with,
    // and again by the codecs on the way in.
    blocks: body.blocks as WritableBlock[],
    origin: COPILOT_ORIGIN,
    seriesId: body.seriesId,
  });

  if (!result.ok) {
    throw new ApiError(
      result.reason === "series-not-found" ? 404 : 400,
      result.reason === "series-not-found"
        ? "Series not found"
        : "That post could not be created",
      result.message,
    );
  }

  return NextResponse.json({
    data: {
      id: result.id,
      revisionId: result.revisionId,
      stateHash: result.stateHash,
      blockCount: result.blockCount,
    },
  });
}, {
  errorLabel: "Error creating a post",
  signInMessage: "Please sign in to create a post",
});
