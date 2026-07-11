/**
 * Virtual "repo" view of the author's content for the Copilot agent.
 *
 * The agent works over the blog as if it were a folder of Markdown files. Each
 * document becomes a file addressed by `<id>.md`; listing/searching/reading are
 * pure, synchronous functions over a Redux `documents` snapshot so they can run
 * client-side (which is the only place all content — local IndexedDB + cloud —
 * is available) with no server round-trip.
 *
 * Content comes from `local.data` (the full `SerializedEditorState`). Cloud-only
 * documents expose metadata (title, series) and are matched by title, but their
 * body isn't in the store, so pure repo reads report them as not-locally-loaded.
 * The current-document Copilot executor hydrates a cloud-only head revision on
 * demand when no live editor or local body is available.
 */
import type { SerializedEditorState } from "lexical";
import type { UserDocument } from "@/types";
import { serializedStateToMarkdown } from "./markdownBridge";

export interface RepoFileMeta {
  path: string;
  title: string;
  seriesId: string | null;
  source: "local" | "cloud" | "both";
  /** Whether the body is available client-side (i.e. has local `data`). */
  hasContent: boolean;
}

export interface RepoReadResult {
  path: string;
  title: string;
  markdown: string;
  hasContent: boolean;
}

export interface RepoSearchHit {
  path: string;
  title: string;
  line: number;
  text: string;
}

const pathOf = (doc: UserDocument): string => `${doc.id}.md`;
const titleOf = (doc: UserDocument): string =>
  doc.local?.name ?? doc.cloud?.name ?? "Untitled";
const seriesOf = (doc: UserDocument): string | null =>
  doc.local?.seriesId ?? doc.cloud?.seriesId ?? null;
const sourceOf = (doc: UserDocument): RepoFileMeta["source"] =>
  doc.local && doc.cloud ? "both" : doc.local ? "local" : "cloud";
const dataOf = (doc: UserDocument): SerializedEditorState | undefined =>
  doc.local?.data;

const findByPath = (
  docs: UserDocument[],
  path: string,
): UserDocument | undefined => {
  const id = path.replace(/\.md$/, "");
  return docs.find((d) => d.id === id);
};

/** List every document as a repo file (metadata only — cheap). */
export function listDocuments(docs: UserDocument[]): RepoFileMeta[] {
  return docs.map((doc) => ({
    path: pathOf(doc),
    title: titleOf(doc),
    seriesId: seriesOf(doc),
    source: sourceOf(doc),
    hasContent: Boolean(dataOf(doc)),
  }));
}

/** Read one document's body as Markdown (rich nodes as opaque tokens). */
export function readDocument(
  docs: UserDocument[],
  path: string,
): RepoReadResult {
  const doc = findByPath(docs, path);
  if (!doc) {
    return { path, title: "", markdown: "", hasContent: false };
  }
  const data = dataOf(doc);
  return {
    path: pathOf(doc),
    title: titleOf(doc),
    markdown: data ? serializedStateToMarkdown(data) : "",
    hasContent: Boolean(data),
  };
}

/**
 * Grep-style search across titles and locally-available bodies. `query` is a
 * plain (case-insensitive) substring; returns per-line hits, capped so a broad
 * query can't flood the context window.
 */
export function searchDocuments(
  docs: UserDocument[],
  query: string,
  maxHits = 60,
): RepoSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: RepoSearchHit[] = [];

  for (const doc of docs) {
    if (hits.length >= maxHits) break;
    const title = titleOf(doc);
    const path = pathOf(doc);

    // Title match surfaces the document even when its body isn't local.
    if (title.toLowerCase().includes(needle)) {
      hits.push({ path, title, line: 0, text: `# ${title}` });
    }

    const data = dataOf(doc);
    if (!data) continue;
    const markdown = serializedStateToMarkdown(data);
    const lines = markdown.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (hits.length >= maxHits) break;
      if (lines[i].toLowerCase().includes(needle)) {
        hits.push({ path, title, line: i + 1, text: lines[i].trim() });
      }
    }
  }
  return hits;
}

/** Resolve a repo path back to the underlying document id (or null). */
export function resolveDocId(
  docs: UserDocument[],
  path: string,
): string | null {
  return findByPath(docs, path)?.id ?? null;
}
