import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CopilotThread, CopilotThreadInput } from "@/types";
import type { UIMessage } from "ai";

/**
 * Copilot conversations. See `prisma/schema.prisma` and plan §6.3.
 *
 * Every function here is author-scoped in its `where` clause rather than
 * fetching and then comparing ids — the same discipline as the rest of
 * `src/repositories`, and the reason `src/lib/access.ts` only needs one helper
 * for this model (the update path, which has to distinguish "not yours" from
 * "does not exist yet").
 */

/**
 * How many threads a scope keeps. The whole history is loaded at once to
 * populate the panel's menu, so this is a real bound and not a tidy-up: without
 * it a long-lived document's scope grows without limit and the menu query grows
 * with it.
 */
const MAX_THREADS_PER_SCOPE = 20;

type CopilotThreadRow = Prisma.CopilotThreadGetPayload<object>;

const toThread = (row: CopilotThreadRow): CopilotThread => ({
  id: row.id,
  scope: row.scope,
  title: row.title,
  current: row.current,
  updatedAt: row.updatedAt.toISOString(),
  messages: (row.messages ?? []) as unknown as UIMessage[],
});

/** Every thread in one scope, newest first. */
export async function findThreadsByScope(
  authorId: string,
  scope: string,
): Promise<CopilotThread[]> {
  const rows = await prisma.copilotThread.findMany({
    where: { authorId, scope },
    orderBy: { updatedAt: "desc" },
    take: MAX_THREADS_PER_SCOPE,
  });
  return rows.map(toThread);
}

/**
 * The thread by id, or null. Used only by the access helper — callers that want
 * a thread should go through `requireWritableCopilotThread`.
 */
export async function findThreadById(
  id: string,
): Promise<{ id: string; authorId: string } | null> {
  return prisma.copilotThread.findUnique({
    where: { id },
    select: { id: true, authorId: true },
  });
}

/**
 * Write a thread, creating it if the id is new.
 *
 * The client owns thread ids, which is what makes this an upsert rather than a
 * create/update pair: the same call saves the first message of a new
 * conversation and the fortieth message of an old one. `authorId` is taken from
 * the session, never from the body, so an upsert cannot re-home a thread.
 */
export async function upsertThread(
  authorId: string,
  input: CopilotThreadInput,
): Promise<CopilotThread> {
  const messages = input.messages as unknown as Prisma.InputJsonValue;
  const row = await prisma.copilotThread.upsert({
    where: { id: input.id },
    create: {
      id: input.id,
      authorId,
      scope: input.scope,
      title: input.title,
      current: input.current,
      messages,
    },
    // `scope` is deliberately not updatable: a thread belongs to the
    // conversation it started in, and moving one would silently rewrite history
    // under a different document.
    update: {
      title: input.title,
      current: input.current,
      messages,
    },
  });
  // Only an archive can grow the history — the live thread is one row rewritten
  // on every turn. Trimming here rather than on every save keeps two extra
  // statements off the path taken after each assistant reply.
  if (!input.current) await trimScope(authorId, row.scope);
  return toThread(row);
}

export async function deleteThread(
  id: string,
  authorId: string,
): Promise<string> {
  await prisma.copilotThread.deleteMany({ where: { id, authorId } });
  return id;
}

/**
 * Drop the oldest archived threads past the cap.
 *
 * `current` is excluded so the live conversation can never be trimmed out from
 * under the user, however long it has been since it was last touched.
 */
async function trimScope(authorId: string, scope: string): Promise<void> {
  const keep = await prisma.copilotThread.findMany({
    where: { authorId, scope },
    orderBy: { updatedAt: "desc" },
    take: MAX_THREADS_PER_SCOPE,
    select: { id: true },
  });
  if (keep.length < MAX_THREADS_PER_SCOPE) return;
  await prisma.copilotThread.deleteMany({
    where: {
      authorId,
      scope,
      current: false,
      id: { notIn: keep.map((row) => row.id) },
    },
  });
}
