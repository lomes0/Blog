"use client";
import type { UIMessage } from "ai";
import { threadBackendFor } from "@/store/backend/threads";
import type { CopilotThread, User } from "@/types";

/**
 * Copilot conversations, persisted per user and per scope.
 *
 * This used to be localStorage, which made a thread a property of the *browser*:
 * two accounts on one machine shared a history, and a conversation did not
 * follow its author to another device. Plan §6.3 decided against that — once the
 * chatbox is a way to act on the library rather than only ask about it, the
 * thread is the record of what was done.
 *
 * Everything here is a thin arrangement over `CopilotThreadBackend`, which is
 * where the local/cloud choice is made. There is no branch on the session in
 * this file, deliberately: that is the property the seam exists to give.
 *
 * A **scope** is a document id, or {@link WORKSPACE_SCOPE} for the conversation
 * with no document behind it. Within a scope exactly one thread is `current`
 * (the live conversation); the rest are history, newest first.
 */

const TITLE_MAX = 60;

/**
 * Every failure here is swallowed into a benign value.
 *
 * A conversation that cannot be loaded should start empty, and one that cannot
 * be saved should not take the message the user is mid-way through typing with
 * it. The panel has no repair affordance to offer, and an alert over a chat is
 * worse than a thread that quietly does not persist.
 */
async function guard<T>(work: Promise<T>, fallback: T): Promise<T> {
  try {
    return await work;
  } catch (error) {
    console.error("[copilot] thread storage", error);
    return fallback;
  }
}

/** Every thread in a scope, newest first. */
async function loadThreads(
  user: User | undefined,
  scope: string,
): Promise<CopilotThread[]> {
  if (!scope) return [];
  return guard(threadBackendFor(user).list(scope), []);
}

/** The live conversation for a scope, or an empty one. */
export async function loadCurrentThread(
  user: User | undefined,
  scope: string,
): Promise<CopilotThread | null> {
  const threads = await loadThreads(user, scope);
  return threads.find((thread) => thread.current) ?? null;
}

/** Past conversations for a scope, newest first. */
export async function loadHistory(
  user: User | undefined,
  scope: string,
): Promise<CopilotThread[]> {
  const threads = await loadThreads(user, scope);
  return threads.filter((thread) => !thread.current);
}

function deriveTitle(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (firstUser) {
    const text = firstUser.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text?: string }).text ?? "")
      .join(" ")
      .trim();
    if (text) {
      return text.length > TITLE_MAX
        ? `${text.slice(0, TITLE_MAX - 1)}…`
        : text;
    }
  }
  return "Conversation";
}

/**
 * Write the live conversation for a scope.
 *
 * `threadId` is the caller's — a chat holds one for its lifetime, so every turn
 * of the same conversation overwrites one row rather than accumulating a
 * hundred. Returns nothing: the caller already has the messages, and awaiting a
 * round trip to learn its own state would put the composer behind the network.
 */
export async function saveCurrentThread(
  user: User | undefined,
  scope: string,
  threadId: string,
  messages: UIMessage[],
): Promise<void> {
  if (!scope || messages.length === 0) return;
  await guard(
    threadBackendFor(user).save({
      id: threadId,
      scope,
      title: deriveTitle(messages),
      current: true,
      messages,
    }).then(() => undefined),
    undefined,
  );
}

/**
 * Stand the live conversation down, so the next message starts a new one.
 *
 * Archiving is a flag flip rather than a copy: the thread keeps its id, so the
 * history entry and the conversation the user was just having are the same row.
 * An empty conversation is dropped instead of archived — there is nothing in it
 * to come back to.
 */
export async function archiveCurrentThread(
  user: User | undefined,
  previous: CopilotThread | null,
): Promise<void> {
  if (!previous) return;
  const backend = threadBackendFor(user);
  await guard(
    previous.messages.length > 0
      ? backend.save({ ...previous, current: false }).then(() => undefined)
      : backend.delete(previous.id).then(() => undefined),
    undefined,
  );
}

/**
 * Make a past conversation live again, archiving whatever is live now.
 *
 * Order matters: the current thread is stood down first, so the two writes can
 * never leave a scope with two live threads if the second one fails.
 */
export async function resumeThread(
  user: User | undefined,
  current: CopilotThread | null,
  thread: CopilotThread,
): Promise<void> {
  if (current && current.id !== thread.id) {
    await archiveCurrentThread(user, current);
  }
  await guard(
    threadBackendFor(user).save({ ...thread, current: true }).then(() =>
      undefined
    ),
    undefined,
  );
}
