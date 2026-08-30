/**
 * The Copilot's view of the author's content.
 *
 * Everything here is a pure, synchronous function over a Redux `documents`
 * snapshot, so it runs client-side — the only place *all* content is available,
 * since local IndexedDB documents never reach the server at all.
 *
 * Documents used to be presented as a folder of Markdown files addressed by
 * `<id>.md`, with rich nodes hidden inside opaque `[[lexblk:…]]` tokens. That
 * framing is gone: content is addressed by block through
 * `src/lib/content-bridge` (docs/plans/archive/claude-code-lexical.md), so the agent can
 * see a kanban board is there and move it, rather than being handed base64 it
 * must not touch.
 *
 * Cloud-only documents expose metadata and are matched by title, but their body
 * is not in the store; the executors hydrate a cloud head revision on demand.
 */
import type { Post } from "@/types";
import {
  blockText,
  nodeToBlock,
  type StoredState,
  walkBlocks,
} from "@/lib/content-bridge";

export interface RepoFileMeta {
  id: string;
  title: string;
  seriesId: string | null;
  /** Whether the body is loaded client-side (i.e. the post has `data`). */
  hasContent: boolean;
}

export interface RepoSearchHit {
  id: string;
  title: string;
  /** The block address the match is in — feed it straight to `read_blocks`. */
  blockId: string;
  kind: string;
  text: string;
}

const titleOf = (doc: Post): string => doc.title ?? "Untitled";
const stateOf = (doc: Post): StoredState | undefined =>
  doc.data as StoredState | undefined;

/** Accepts a bare id or a legacy `<id>.md` path. */
export const normalizeDocId = (ref: string): string =>
  ref.trim().replace(/\.md$/i, "");

const findById = (docs: Post[], ref: string): Post | undefined => {
  const id = normalizeDocId(ref);
  return docs.find((doc) => doc.id === id);
};

/** List every document (metadata only — cheap). */
export function listDocuments(docs: Post[]): RepoFileMeta[] {
  return docs.map((doc) => ({
    id: doc.id,
    title: titleOf(doc),
    seriesId: doc.seriesId ?? null,
    hasContent: Boolean(stateOf(doc)),
  }));
}

/**
 * Search titles and locally-available bodies for a substring.
 *
 * Hits are per *block* rather than per line, so a match comes back with an
 * address the agent can read or edit directly instead of a line number that
 * means nothing to any other tool.
 */
export function searchDocuments(
  docs: Post[],
  query: string,
  maxHits = 60,
): RepoSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: RepoSearchHit[] = [];

  for (const doc of docs) {
    if (hits.length >= maxHits) break;
    const title = titleOf(doc);

    // A title match surfaces the document even when its body is not local.
    if (title.toLowerCase().includes(needle)) {
      hits.push({ id: doc.id, title, blockId: "", kind: "title", text: title });
    }

    const state = stateOf(doc);
    if (!state) continue;

    for (const { address, node } of walkBlocks(state)) {
      if (hits.length >= maxHits) break;
      const block = nodeToBlock(node);
      const haystack = blockText(block);
      const at = haystack.toLowerCase().indexOf(needle);
      if (at === -1) continue;
      hits.push({
        id: doc.id,
        title,
        blockId: address,
        kind: block.type === "opaque" ? block.nodeType : block.type,
        text: haystack
          .slice(Math.max(0, at - 40), at + needle.length + 40)
          .replace(/\s+/g, " ")
          .trim(),
      });
    }
  }
  return hits;
}

/** Resolve a reference back to a document id (or null). */
export function resolveDocId(docs: Post[], ref: string): string | null {
  return findById(docs, ref)?.id ?? null;
}

/** A document's stored state, if its body is loaded client-side. */
export function documentState(
  docs: Post[],
  ref: string,
): { id: string; title: string; state?: StoredState } | null {
  const doc = findById(docs, ref);
  if (!doc) return null;
  return { id: doc.id, title: titleOf(doc), state: stateOf(doc) };
}
