"use client";
import type { UIMessage } from "ai";

/**
 * Per-document Copilot conversation persistence (localStorage).
 *
 * - The *current* thread for a document survives panel close/reopen and tab
 *   switches.
 * - Starting a new conversation (or loading a past one) archives the current
 *   thread into a bounded per-document history.
 */

const CURRENT_PREFIX = "copilot:current:";
const HISTORY_PREFIX = "copilot:history:";
const MAX_HISTORY = 20;
const TITLE_MAX = 60;

/**
 * Scope key for a conversation with no document behind it — the one the home
 * pane's composer starts. Every other scope is a document id (a uuid), so this
 * cannot collide with one, and a workspace thread persists and archives exactly
 * like a per-document thread.
 */
export const WORKSPACE_SCOPE = "workspace";

export interface CopilotThread {
  id: string;
  title: string;
  updatedAt: number;
  messages: UIMessage[];
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(error);
  }
}

export function loadCurrentThread(docId: string): UIMessage[] {
  if (!docId) return [];
  return read<UIMessage[]>(CURRENT_PREFIX + docId, []);
}

export function saveCurrentThread(docId: string, messages: UIMessage[]): void {
  if (!docId) return;
  write(CURRENT_PREFIX + docId, messages);
}

export function clearCurrentThread(docId: string): void {
  if (!docId || typeof window === "undefined") return;
  window.localStorage.removeItem(CURRENT_PREFIX + docId);
}

export function loadHistory(docId: string): CopilotThread[] {
  if (!docId) return [];
  return read<CopilotThread[]>(HISTORY_PREFIX + docId, []);
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

/** Archive a thread into the document's history (newest first, bounded). */
export function archiveThread(docId: string, messages: UIMessage[]): void {
  if (!docId || messages.length === 0) return;
  const thread: CopilotThread = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: deriveTitle(messages),
    updatedAt: Date.now(),
    messages,
  };
  const next = [thread, ...loadHistory(docId)].slice(0, MAX_HISTORY);
  write(HISTORY_PREFIX + docId, next);
}

export function removeFromHistory(docId: string, threadId: string): void {
  if (!docId) return;
  write(
    HISTORY_PREFIX + docId,
    loadHistory(docId).filter((t) => t.id !== threadId),
  );
}
