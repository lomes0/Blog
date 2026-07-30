/**
 * API-layer types that supplement the shared `src/types.ts` definitions:
 * request bodies, and the payload shapes for routes whose responses are not
 * already named there.
 *
 * There are no `…Response` envelope types here. `request()` in `client.ts`
 * unwraps the `{ data?, error? }` envelope and throws on `error`, so a method
 * returns the payload type itself — an envelope interface would name a shape
 * no caller ever holds.
 */

export interface ApiError {
  title: string;
  subtitle?: string;
}

// -----------------------------------------------------------------------
// Documents – paged list (GET /api/documents)
// -----------------------------------------------------------------------
// Keyset pagination: `nextCursor` is the last returned document's id, or null
// once the list is exhausted. It travels inside the `{ data }` envelope so the
// standard `request()` unwrapping still applies.
export interface PaginatedDocuments {
  documents: import("@/types").Post[];
  nextCursor: string | null;
}

// -----------------------------------------------------------------------
// Series posts (PATCH /api/series/:id/posts)
// -----------------------------------------------------------------------
// Posts are appended to the series; manual position is controlled via `rank`,
// so add/remove take bare post ids.
export interface UpdateSeriesPostsInput {
  postsToAdd: string[];
  postsToRemove: string[];
}

// -----------------------------------------------------------------------
// Move / reorder a document (PATCH /api/documents/:id/move)
// -----------------------------------------------------------------------
// `destination` fully specifies the new container (series / tab-group / root) —
// it is not a partial patch. Omitting `between` appends to the end; otherwise
// the document is placed between the given neighbour ranks.
export interface MoveDocumentInput {
  destination: { seriesId?: string | null; parentId?: string | null };
  between?: { afterRank?: string | null; beforeRank?: string | null };
}

// Move / reorder a series (PATCH /api/series/:id/move). `destination.projectId`
// re-homes the series into a project (or to root when null); omit `destination`
// to keep its current container. Omit `between` to append; otherwise it is
// placed between the given neighbour ranks.
export interface MoveSeriesInput {
  destination?: { projectId?: string | null };
  between?: { afterRank?: string | null; beforeRank?: string | null };
}

// Reorder a project within the root list (PATCH /api/projects/:id/move).
export interface MoveProjectInput {
  between?: { afterRank?: string | null; beforeRank?: string | null };
}

// -----------------------------------------------------------------------
// Document times (POST /api/documents/update-times)
// -----------------------------------------------------------------------
export interface DocumentTimeUpdate {
  id: string;
  createdAt: Date | string;
}

export interface UpdateDocumentTimesInput {
  updates: DocumentTimeUpdate[];
}

// -----------------------------------------------------------------------
// Attachments (POST /api/documents/:id/attachments)
// -----------------------------------------------------------------------
export interface AttachmentData {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
}

// -----------------------------------------------------------------------
// Notes / canvas (GET /api/notes/canvas, POST /api/notes)
// -----------------------------------------------------------------------
export interface NotesCanvas {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notes: any[];
}

export interface CreateNoteInput {
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  title?: string;
  content: string;
  color: string;
  zIndex: number;
}

