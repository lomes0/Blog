import { type PendingSave, pendingSaveDB } from "@/indexeddb";
import type { Failure } from "@/store/thunks/createApiThunk";
import type { SerializedEditorState } from "lexical";

/**
 * The unconfirmed-save buffer.
 *
 * Its whole purpose is to make a dropped connection a non-event: the editor
 * writes here before every save attempt and clears the record once storage
 * acknowledges, so an edit is never held only in a component's memory. If the
 * tab is closed or crashes while the network is down, the record is still here
 * on the next load and the editor picks up where it left off.
 *
 * A read failure is never fatal — the buffer is an extra safety net, and losing
 * it must not stop the user from editing. Reads therefore degrade to "nothing
 * pending" rather than throwing.
 */

export async function readPendingSave(
  postId: string,
): Promise<PendingSave | undefined> {
  try {
    return await pendingSaveDB.getByID(postId) as PendingSave | undefined;
  } catch (error) {
    console.warn("Could not read pending save", error);
    return undefined;
  }
}

export async function writePendingSave(save: PendingSave): Promise<void> {
  try {
    await pendingSaveDB.update(save);
  } catch (error) {
    console.warn("Could not record pending save", error);
  }
}

export async function clearPendingSave(postId: string): Promise<void> {
  try {
    await pendingSaveDB.deleteByID(postId);
  } catch (error) {
    console.warn("Could not clear pending save", error);
  }
}

/**
 * Whether a buffered save is worth restoring over what storage returned.
 *
 * Only content that storage has *not* caught up with should win: if the backend
 * already reports the head this record was going to create, the save landed and
 * the record is just stale.
 */
export function isPendingSaveAhead(
  pending: PendingSave | undefined,
  storedHead: string,
): pending is PendingSave {
  return !!pending && pending.headId !== storedHead;
}

/**
 * Whether a failure is another writer having got there first.
 *
 * A 409 from the save route is not a fault and not transient: it says storage
 * holds a head this tab has not seen, so the same request will keep being
 * refused until the tab catches up. The save loop stops rather than retrying.
 */
export function isConflict(error: unknown): boolean {
  return (error as Failure | undefined)?.statusCode === 409;
}

/** Whether a network failure is worth retrying rather than surfacing. */
export function isTransient(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }
  // `fetch` rejects with a TypeError when it cannot reach the server at all;
  // an HTTP error (4xx/5xx) means we did reach it, so it is a real failure.
  return error instanceof TypeError;
}

/** Convenience for building a record from the editor's current state. */
export function pendingSaveOf(
  postId: string,
  headId: string,
  data: SerializedEditorState,
  updatedAt: string,
): PendingSave {
  return { id: postId, headId, data, updatedAt };
}
