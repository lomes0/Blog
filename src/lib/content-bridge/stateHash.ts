/**
 * The content hash that guards every write (plan §4.3).
 *
 * `head` cannot serve as a version here: `createRevision` upserts, because the
 * editor folds a run of autosaves into one revision id, so `Revision.data`
 * moves while `Document.head` stays put (plan §2.2). A hash over the content
 * itself is the only token that actually changes when the document does.
 *
 * It does double duty. Addresses are structural paths derived from the tree
 * (plan §4.2), so a matching hash does not merely say "no one else wrote" — it
 * says *these paths still point at what they pointed at*. That is why the guard
 * and the addressing scheme are the same mechanism.
 *
 * This is an integrity token, not a security boundary: nothing is authenticated
 * by it and a collision costs a stale write, not a privilege. So it is a plain
 * non-cryptographic hash, chosen to be synchronous in both the browser and
 * Node — `crypto.subtle` is async, which would push `await` through every
 * caller for no benefit.
 */
import type { StoredState } from "./types";

const FNV_PRIME = 0x01000193;
const LANE_A_SEED = 0x811c9dc5;
const LANE_B_SEED = 0x9dc5811c;

/** FNV-1a over a chunk, folded into a running 32-bit state. */
function fold(state: number, chunk: string): number {
  let h = state;
  for (let i = 0; i < chunk.length; i++) {
    h ^= chunk.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/**
 * Feed a value to `emit` in a canonical order.
 *
 * Object keys are sorted, so two states that differ only in key order hash the
 * same — which matters because a state that has been through a node class and
 * one parsed from storage need not agree on key order. Every value carries a
 * type tag, so the string `"1"` and the number `1` cannot collide.
 */
function canonicalize(value: unknown, emit: (chunk: string) => void): void {
  if (value === null) return emit("n");
  if (value === undefined) return emit("u");

  switch (typeof value) {
    case "boolean":
      return emit(value ? "t" : "f");
    case "number":
      // `-0` and `0` are the same value to a reader; normalize so they hash alike.
      return emit(`#${Object.is(value, -0) ? 0 : value}`);
    case "string":
      // Length-prefixed so "a" + "bc" cannot hash as "ab" + "c".
      return emit(`s${value.length}:${value}`);
    default:
      break;
  }

  if (Array.isArray(value)) {
    emit("[");
    for (const item of value) canonicalize(item, emit);
    return emit("]");
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    emit("{");
    for (const key of Object.keys(record).sort()) {
      // `undefined` members are absent once stored, so skip them rather than
      // let an in-memory state hash differently from its stored form.
      if (record[key] === undefined) continue;
      emit(`k${key.length}:${key}`);
      canonicalize(record[key], emit);
    }
    return emit("}");
  }

  // Functions and symbols cannot appear in stored JSON.
  emit("?");
}

/**
 * A stable hash of a stored editor state.
 *
 * Accepts the parsed object or the raw JSON string, because `Revision.data`
 * arrives as either depending on the caller.
 */
export function stateHash(data: StoredState | string | unknown): string {
  const parsed: unknown = typeof data === "string" ? JSON.parse(data) : data;

  let laneA = LANE_A_SEED;
  let laneB = LANE_B_SEED;
  canonicalize(parsed, (chunk) => {
    laneA = fold(laneA, chunk);
    laneB = fold(laneB, chunk);
  });

  const hex = (n: number) => n.toString(16).padStart(8, "0");
  return `h_${hex(laneA)}${hex(laneB)}`;
}

/** Thrown when a write's hash does not match the document's current content. */
export class StaleStateError extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      "The document changed since it was read, so the block addresses in this " +
        "write no longer point where they did. Re-read it and retry.",
    );
    this.name = "StaleStateError";
  }
}

/** Refuse a write whose addresses were derived from different content. */
export function assertFresh(data: unknown, expected: string): void {
  const actual = stateHash(data);
  if (actual !== expected) throw new StaleStateError(expected, actual);
}
