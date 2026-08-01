import { apiClient } from "@/api";
import { getStore } from "@/indexeddb";
import type { CopilotThread, CopilotThreadInput, User } from "@/types";

/**
 * Storage for the session's Copilot conversations.
 *
 * A sibling of {@link PostBackend}, not a member of it: threads are not posts,
 * and nesting them under a post backend would put a conversation about the whole
 * library inside the API surface for one document. The *shape* is deliberately
 * identical — two implementations behind one interface, chosen from the session
 * alone by {@link threadBackendFor} — so there is still exactly one place the
 * local/cloud decision is made, and everything above it is written once.
 *
 * See docs/plans/workspace-panes.md §6.3.
 */
interface CopilotThreadBackend {
  /** Every thread in one scope, newest first. The live one has `current`. */
  list(scope: string): Promise<CopilotThread[]>;
  /** Write a thread, creating it if the id is new. The caller owns the id. */
  save(thread: CopilotThreadInput): Promise<CopilotThread>;
  /** Resolves to the deleted thread's id. */
  delete(id: string): Promise<string>;
}

/**
 * Exactly the fields a caller may write, listed rather than spread.
 *
 * Callers legitimately hold a whole `CopilotThread` and want to flip one field
 * on it (`{ ...thread, current: false }`), which carries the server-owned
 * `updatedAt` along with it — and the PUT schema is `.strict()`, so that is a
 * 400 naming a field nobody meant to send. TypeScript does not catch it: excess
 * properties survive a spread. Narrowing here means it cannot be got wrong at a
 * call site.
 */
const toInput = (
  { id, scope, title, current, messages }: CopilotThreadInput,
): CopilotThreadInput => ({ id, scope, title, current, messages });

const cloudThreadBackend: CopilotThreadBackend = {
  async list(scope) {
    return (await apiClient.copilotThreads.list(scope)) ?? [];
  },

  async save(thread) {
    const saved = await apiClient.copilotThreads.save(toInput(thread));
    if (!saved) throw new Error("failed to save conversation");
    return saved;
  },

  async delete(id) {
    const deleted = await apiClient.copilotThreads.delete(id);
    return deleted?.id ?? id;
  },
};

const threadDB = getStore<CopilotThread>("copilotThreads");

const localThreadBackend: CopilotThreadBackend = {
  async list(scope) {
    const threads = await threadDB.getManyByKey("scope", scope);
    return [...threads].sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0
    );
  },

  async save(thread) {
    // `updatedAt` is stamped here rather than by the caller so both backends
    // agree on what it means: the moment the write happened, not the moment the
    // component decided to write. The cloud half gets it from `@updatedAt`.
    const stored: CopilotThread = {
      ...toInput(thread),
      updatedAt: new Date().toISOString(),
    };
    // `put`, not `add`: saving a thread again on every turn of a conversation
    // is the normal case, and an existing id is not an error.
    await threadDB.update(stored);
    return stored;
  },

  async delete(id) {
    await threadDB.deleteByID(id);
    return id;
  },
};

/**
 * The session's thread backend. Mirrors `backendFor` — derived on every call,
 * never stored on a thread, so a guest who signs in does not carry a stale
 * choice with them.
 */
export const threadBackendFor = (
  user?: User | null,
): CopilotThreadBackend => user ? cloudThreadBackend : localThreadBackend;
