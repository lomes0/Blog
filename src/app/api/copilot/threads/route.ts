import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseBody, userRoute } from "@/lib/api-utils";
import { requireWritableCopilotThread } from "@/lib/access";
import { findThreadsByScope, upsertThread } from "@/repositories/copilotThread";
import type { UIMessage } from "ai";

export const dynamic = "force-dynamic";

/**
 * Persisted Copilot conversations, per user and per scope (plan §6.3).
 *
 * The cloud half of the `CopilotThreadBackend` seam — `src/store/backend/
 * threads.ts` picks this or IndexedDB from the session alone, exactly as
 * `backendFor` does for posts.
 */

/**
 * Messages are validated structurally and stored as-is.
 *
 * `parts` is an open union owned by the AI SDK, and a copy of it here would be
 * a second source of truth that drifts every time that library adds a part
 * type — the same call the Copilot route's own body schema makes. What this
 * route actually acts on is `id`/`scope`/`title`/`current`, and those are
 * validated properly.
 */
const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["system", "user", "assistant"]),
  parts: z.array(z.unknown()),
}).passthrough();

const upsertSchema = z.object({
  id: z.string().uuid(),
  scope: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  current: z.boolean(),
  messages: z.array(messageSchema),
}).strict();

/** GET /api/copilot/threads?scope=<id> — every thread in one scope, newest first. */
export const GET = userRoute(async (request, { user }) => {
  const scope = new URL(request.url).searchParams.get("scope");
  if (!scope) {
    throw new ApiError(400, "Bad Request", "A scope is required");
  }
  const threads = await findThreadsByScope(user.id, scope);
  return NextResponse.json({ data: threads });
}, {
  errorLabel: "Error fetching conversations",
  signInMessage: "Please sign in to read your conversations",
});

/**
 * PUT /api/copilot/threads — write a thread, creating it if the id is new.
 *
 * A PUT rather than a POST because the client owns the id and the call is
 * idempotent: the same thread is written again on every turn of a conversation.
 */
export const PUT = userRoute(async (request, { user }) => {
  const input = await parseBody(request, upsertSchema);
  await requireWritableCopilotThread(input.id, user);
  const thread = await upsertThread(user.id, {
    ...input,
    messages: input.messages as unknown as UIMessage[],
  });
  return NextResponse.json({ data: thread });
}, {
  errorLabel: "Error saving conversation",
  signInMessage: "Please sign in to save your conversation",
});
