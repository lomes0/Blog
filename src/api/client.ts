/**
 * Central API client for all `/api/*` routes.
 *
 * - Every route is accessed through a typed, named method — no raw URL strings
 *   scattered across the codebase.
 * - All methods throw `ApiClientError` on HTTP errors or API-level `error`
 *   responses, so callers just need a single `try/catch`.
 * - Easy to mock in tests: `apiClient.documents.list = jest.fn(...)`.
 */

import type { SerializedEditorState } from "lexical";
import type {
  AgentCreatedPost,
  CopilotThread,
  CopilotThreadInput,
  DocumentStorageUsage,
  GetSessionResponse,
  PendingProposal,
  Post,
  PostCreateInput,
  PostUpdateInput,
  Project,
  ProposalCount,
  Revision,
  RevisionMeta,
  Series,
  User,
} from "@/types";

import type { Op, WritableBlock } from "@/lib/content-bridge";

import type {
  AgentPostResult,
  AgentProposalResult,
  ApiError,
  AttachmentData,
  CreateNoteInput,
  DocumentChanges,
  MoveDocumentInput,
  MoveSeriesInput,
  OrderInput,
  NotesCanvas,
  PaginatedDocuments,
  UpdateDocumentTimesInput,
  UpdateSeriesPostsInput,
} from "./types";

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly details?: ApiError,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

/**
 * Fetches `url`, throws `ApiClientError` on non-2xx, and returns the
 * `data` field of the JSON body (the standard `{ data?, error? }` envelope).
 */
async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T | undefined> {
  const res = await fetch(url, options);
  if (!res.ok) {
    let details: ApiError | undefined;
    try {
      const body = await res.json();
      details = body?.error;
    } catch {
      // ignore parse failure
    }
    const msg = details
      ? details.subtitle
        ? `${details.title}: ${details.subtitle}`
        : details.title
      : `Request failed with status ${res.status}`;
    throw new ApiClientError(msg, res.status, details);
  }
  const body = (await res.json()) as { data?: T; error?: ApiError };
  if (body.error) {
    const { error } = body;
    const msg = error.subtitle
      ? `${error.title}: ${error.subtitle}`
      : error.title;
    throw new ApiClientError(msg, res.status, error);
  }
  return body.data;
}

/**
 * Like `request` but returns the raw JSON body without unwrapping `data`.
 * Used for endpoints whose response is not in the `{ data }` envelope
 * (e.g. NextAuth `/api/auth/session`).
 */
async function requestRaw<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    let details: ApiError | undefined;
    try {
      const body = await res.json();
      details = body?.error;
    } catch {
      // ignore
    }
    const msg = details
      ? details.subtitle
        ? `${details.title}: ${details.subtitle}`
        : details.title
      : `Request failed with status ${res.status}`;
    throw new ApiClientError(msg, res.status, details);
  }
  return res.json() as Promise<T>;
}

/** Fetches and returns the response body as plain text. Throws on non-2xx. */
async function requestText(
  url: string,
  options?: RequestInit,
): Promise<string> {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new ApiClientError(
      `Request failed with status ${res.status}`,
      res.status,
    );
  }
  return res.text();
}

/** Build JSON POST/PATCH bodies. */
function json(body: unknown): RequestInit {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// ---------------------------------------------------------------------------
// Public API client
// ---------------------------------------------------------------------------

export const apiClient = {
  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  auth: {
    /** GET /api/auth/session */
    getSession: (): Promise<GetSessionResponse> =>
      requestRaw<GetSessionResponse>("/api/auth/session"),
  },

  // -------------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------------
  documents: {
    /**
     * GET /api/documents — one page of the signed-in author's posts.
     *
     * Newest first. Pass the previous response's `nextCursor` to continue; a
     * null `nextCursor` means that was the last page. `cloudBackend.list`
     * wraps this to assemble the whole list.
     */
    list: (
      params: { cursor?: string; limit?: number } = {},
    ): Promise<PaginatedDocuments | undefined> => {
      const query = new URLSearchParams();
      if (params.cursor) query.set("cursor", params.cursor);
      if (params.limit !== undefined) query.set("limit", String(params.limit));
      const suffix = query.size ? `?${query}` : "";
      return request<PaginatedDocuments>(`/api/documents${suffix}`, {
        cache: "no-store",
      });
    },

    /**
     * GET /api/documents/changes — the catch-up query (§3).
     *
     * Every document the caller owns, as `{ id, updatedAt }`. `no-store` for
     * the same reason the proposal poll uses it: the whole job is to notice a
     * write that happened since the last look, and a cached answer is the one
     * state this cannot be in.
     */
    changes: (): Promise<DocumentChanges | undefined> =>
      request<DocumentChanges>("/api/documents/changes", {
        cache: "no-store",
      }),

    /** GET /api/documents/:id */
    get: (
      id: string,
    ): Promise<(Post & { cloudDocument: Post }) | undefined> =>
      request<Post & { cloudDocument: Post }>(
        `/api/documents/${id}`,
      ),

    /** POST /api/documents */
    create: (input: PostCreateInput): Promise<Post | undefined> =>
      request<Post>("/api/documents", { method: "POST", ...json(input) }),

    /** PATCH /api/documents/:id */
    update: (
      id: string,
      partial: PostUpdateInput,
    ): Promise<Post | undefined> =>
      request<Post>(`/api/documents/${id}`, {
        method: "PATCH",
        ...json(partial),
      }),

    /** PATCH /api/documents/:id/move — re-home a document (appends) */
    move: (
      id: string,
      payload: MoveDocumentInput,
    ): Promise<Post | undefined> =>
      request<Post>(`/api/documents/${id}/move`, {
        method: "PATCH",
        ...json(payload),
      }),

    /** PATCH /api/documents/:id/tab-order — order a tabbed post's child tabs */
    tabOrder: (
      id: string,
      orderedIds: string[],
    ): Promise<{ tabOrder: string[] } | undefined> =>
      request<{ tabOrder: string[] }>(`/api/documents/${id}/tab-order`, {
        method: "PATCH",
        ...json({ orderedIds } satisfies OrderInput),
      }),

    /** DELETE /api/documents/:id */
    delete: (id: string): Promise<string | undefined> =>
      request<string>(`/api/documents/${id}`, { method: "DELETE" }),

    /** GET /api/documents/:id/children */
    children: (
      id: string,
    ): Promise<
      { id: string; title: string }[] | undefined
    > =>
      request<{ id: string; title: string }[]>(
        `/api/documents/${id}/children`,
        { cache: "no-store" },
      ),

    /**
     * GET /api/documents/check?handle=:handle
     * Pass a custom `endpoint` to target a different check route.
     */
    checkHandle: (
      handle: string,
      endpoint = "/api/documents/check",
    ): Promise<boolean | undefined> =>
      request<boolean>(`${endpoint}?handle=${handle}`),

    /**
     * GET /api/documents/new/:id  (optionally ?v=:revisionId)
     * Returns a fork of the document, optionally at a specific revision.
     */
    fork: (
      id: string,
      revisionId?: string | null,
    ): Promise<(Post & { data: SerializedEditorState }) | undefined> =>
      request<Post & { data: SerializedEditorState }>(
        `/api/documents/new/${id}${revisionId ? `?v=${revisionId}` : ""}`,
      ),

    /**
     * POST /api/documents/:documentId/attachments  (multipart/form-data)
     * NOTE: Do NOT set Content-Type — the browser must set it with the boundary.
     */
    uploadAttachment: (
      documentId: string,
      file: File,
    ): Promise<AttachmentData | undefined> => {
      const formData = new FormData();
      formData.append("file", file);
      return request<AttachmentData>(
        `/api/documents/${documentId}/attachments`,
        { method: "POST", body: formData },
      );
    },

    /** POST /api/documents/update-times */
    updateTimes: (
      updates: UpdateDocumentTimesInput["updates"],
    ): Promise<undefined> =>
      request<undefined>("/api/documents/update-times", {
        method: "POST",
        ...json({ updates }),
      }),
  },

  // -------------------------------------------------------------------------
  // Revisions
  // -------------------------------------------------------------------------
  revisions: {
    /** GET /api/revisions/:id */
    get: (id: string): Promise<Revision | undefined> =>
      request<Revision>(`/api/revisions/${id}`),

    /** POST /api/revisions */
    create: (
      revision: Revision,
    ): Promise<RevisionMeta | undefined> =>
      request<RevisionMeta>("/api/revisions", {
        method: "POST",
        ...json(revision),
      }),

    /** DELETE /api/revisions/:id */
    delete: (
      id: string,
    ): Promise<{ id: string; documentId: string } | undefined> =>
      request<{ id: string; documentId: string }>(`/api/revisions/${id}`, {
        method: "DELETE",
      }),
  },

  // -------------------------------------------------------------------------
  // Agent proposals (docs/plans/archive/agent-gating.md)
  // -------------------------------------------------------------------------
  proposals: {
    /**
     * GET /api/proposals/count — the §3.5 focus poll.
     *
     * `no-store` on every one of these: the whole point is to notice a write
     * that happened in a terminal since the last time the window had focus, and
     * a cached answer is the one state this cannot be in.
     */
    count: (): Promise<ProposalCount | undefined> =>
      request<ProposalCount>("/api/proposals/count", { cache: "no-store" }),

    /** GET /api/proposals — what the rail lists once the count is non-zero. */
    list: (): Promise<
      | { proposals: PendingProposal[]; agentPosts: AgentCreatedPost[] }
      | undefined
    > =>
      request<{ proposals: PendingProposal[]; agentPosts: AgentCreatedPost[] }>(
        "/api/proposals",
        { cache: "no-store" },
      ),

    /**
     * POST /api/documents/:documentId/proposals/:revisionId/approve
     *
     * `decisions` is the per-hunk review's answer (haklex-adoption.md §7) and
     * is **omitted entirely** when nothing was refused — not sent as an empty
     * array. The route reads a body only from a request that declares JSON, so
     * a whole-proposal approval stays the bodiless POST it has always been, and
     * there is one approve path rather than two.
     *
     * Only ids cross the wire. What they mean is recomputed server-side from
     * the two stored revisions, so nothing here is trusted for a byte of
     * document content.
     */
    approve: (
      documentId: string,
      revisionId: string,
      decisions?: { rejectedHunks: string[]; version?: number },
    ): Promise<
      | {
        id: string;
        head: string;
        approved: boolean;
        partial?: { applied: number; total: number };
      }
      | undefined
    > =>
      request<{
        id: string;
        head: string;
        approved: boolean;
        partial?: { applied: number; total: number };
      }>(
        `/api/documents/${documentId}/proposals/${revisionId}/approve`,
        decisions && decisions.rejectedHunks.length > 0
          ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(decisions),
          }
          : { method: "POST" },
      ),

    /** POST /api/documents/:documentId/proposals/:revisionId/reject */
    reject: (
      documentId: string,
      revisionId: string,
    ): Promise<{ id: string; revisionId: string } | undefined> =>
      request<{ id: string; revisionId: string }>(
        `/api/documents/${documentId}/proposals/${revisionId}/reject`,
        { method: "POST" },
      ),

    /** POST /api/documents/:id/agent/accept — keep an agent-created post. */
    acceptPost: (
      id: string,
    ): Promise<{ id: string; accepted: boolean } | undefined> =>
      request<{ id: string; accepted: boolean }>(
        `/api/documents/${id}/agent/accept`,
        { method: "POST" },
      ),

    /** POST /api/documents/:id/agent/discard — delete an agent-created post. */
    discardPost: (
      id: string,
    ): Promise<{ id: string; discarded: boolean } | undefined> =>
      request<{ id: string; discarded: boolean }>(
        `/api/documents/${id}/agent/discard`,
        { method: "POST" },
      ),
  },

  // -------------------------------------------------------------------------
  // Agent writes (docs/plans/archive/ai-surface-consolidation.md §4.4)
  // -------------------------------------------------------------------------
  // The other side of the group above: `proposals` is what the *author* does
  // about an agent's work, this is how the in-app agent's work gets there. Both
  // routes are `src/lib/agentWrites.ts` with an HTTP door in front, so a Copilot
  // edit and a Claude Code edit are one execution of `applyOps` against one
  // base, not two implementations writing the same columns.
  agent: {
    /**
     * POST /api/documents/:id/proposals — propose a block edit.
     *
     * `origin` is not a parameter: the route stamps it, so a page cannot label
     * its write as another agent. Throws `ApiClientError` with `statusCode` 409
     * when `stateHash` no longer matches the state the server would build on —
     * the addresses have moved and the agent must re-read.
     */
    proposeOps: (
      documentId: string,
      body: { stateHash: string; ops: readonly Op[]; summary?: string },
    ): Promise<AgentProposalResult | undefined> =>
      request<AgentProposalResult>(`/api/documents/${documentId}/proposals`, {
        method: "POST",
        ...json(body),
      }),

    /** POST /api/documents/agent — create a post as an agent-flagged draft. */
    createPost: (
      body: {
        title: string;
        blocks: readonly WritableBlock[];
        seriesId?: string;
      },
    ): Promise<AgentPostResult | undefined> =>
      request<AgentPostResult>("/api/documents/agent", {
        method: "POST",
        ...json(body),
      }),
  },

  // -------------------------------------------------------------------------
  // Series
  // -------------------------------------------------------------------------
  series: {
    /** GET /api/series */
    list: (): Promise<Series[] | undefined> => request<Series[]>("/api/series"),

    /** GET /api/series/:id */
    get: (id: string): Promise<Series | undefined> =>
      request<Series>(`/api/series/${id}`),

    /** POST /api/series */
    create: (input: {
      title: string;
      description?: string;
      /** Create it inside this project; omit for the author's root list. */
      projectId?: string | null;
    }): Promise<Series | undefined> =>
      request<Series>("/api/series", { method: "POST", ...json(input) }),

    /** PATCH /api/series/:id/move — re-home a series into/out of a project */
    move: (id: string, payload: MoveSeriesInput): Promise<Series | undefined> =>
      request<Series>(`/api/series/${id}/move`, {
        method: "PATCH",
        ...json(payload),
      }),

    /** PATCH /api/series/:id/order — order the series' posts */
    order: (
      id: string,
      orderedIds: string[],
    ): Promise<{ postOrder: string[] } | undefined> =>
      request<{ postOrder: string[] }>(`/api/series/${id}/order`, {
        method: "PATCH",
        ...json({ orderedIds } satisfies OrderInput),
      }),

    /** PATCH /api/series/:id */
    update: (
      id: string,
      data: { title?: string; description?: string; createdAt?: string },
    ): Promise<Series | undefined> =>
      request<Series>(`/api/series/${id}`, { method: "PATCH", ...json(data) }),

    /** DELETE /api/series/:id */
    delete: (id: string): Promise<string | undefined> =>
      request<string>(`/api/series/${id}`, { method: "DELETE" }),

    /** GET /api/series/available-posts */
    availablePosts: (): Promise<Post[] | undefined> =>
      request<Post[]>("/api/series/available-posts"),

    /** PATCH /api/series/:id/posts */
    updatePosts: (
      id: string,
      payload: UpdateSeriesPostsInput,
    ): Promise<undefined> =>
      request<undefined>(`/api/series/${id}/posts`, {
        method: "PATCH",
        ...json(payload),
      }),
  },

  // -------------------------------------------------------------------------
  // Projects (named groupings of series)
  // -------------------------------------------------------------------------
  projects: {
    /** GET /api/projects */
    list: (): Promise<Project[] | undefined> =>
      request<Project[]>("/api/projects"),

    /** GET /api/projects/:id */
    get: (id: string): Promise<Project | undefined> =>
      request<Project>(`/api/projects/${id}`),

    /** POST /api/projects */
    create: (input: {
      title: string;
      description?: string;
    }): Promise<Project | undefined> =>
      request<Project>("/api/projects", { method: "POST", ...json(input) }),

    /** PATCH /api/projects/:id/order — order the project's member series */
    order: (
      id: string,
      orderedIds: string[],
    ): Promise<{ seriesOrder: string[] } | undefined> =>
      request<{ seriesOrder: string[] }>(`/api/projects/${id}/order`, {
        method: "PATCH",
        ...json({ orderedIds } satisfies OrderInput),
      }),

    /** PATCH /api/projects/:id */
    update: (
      id: string,
      data: { title?: string; description?: string; createdAt?: string },
    ): Promise<Project | undefined> =>
      request<Project>(`/api/projects/${id}`, {
        method: "PATCH",
        ...json(data),
      }),

    /** DELETE /api/projects/:id */
    delete: (id: string): Promise<string | undefined> =>
      request<string>(`/api/projects/${id}`, { method: "DELETE" }),
  },

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------
  users: {
    /** PATCH /api/users/:id */
    update: (id: string, data: Partial<User>): Promise<User | undefined> =>
      request<User>(`/api/users/${id}`, { method: "PATCH", ...json(data) }),

    /**
     * PATCH /api/users/me/root-order — order the session's own root list.
     *
     * No id: the container is the caller, which is also the whole of the
     * ownership check (docs/plans/archive/ordering-simplification.md §4).
     */
    rootOrder: (
      orderedIds: string[],
    ): Promise<{ rootOrder: string[] } | undefined> =>
      request<{ rootOrder: string[] }>("/api/users/me/root-order", {
        method: "PATCH",
        ...json({ orderedIds } satisfies OrderInput),
      }),
  },

  // -------------------------------------------------------------------------
  // Storage usage
  // -------------------------------------------------------------------------
  storage: {
    /** GET /api/usage */
    getUsage: (): Promise<DocumentStorageUsage[] | undefined> =>
      request<DocumentStorageUsage[]>("/api/usage"),
  },

  // -------------------------------------------------------------------------
  // Thumbnails
  // -------------------------------------------------------------------------
  thumbnails: {
    /**
     * GET /api/thumbnails/:documentId
     * Sends Cache-Control: max-age=300 to match the per-call hint used
     * previously in postHelpers.ts.
     */
    get: (documentId: string): Promise<string | undefined> =>
      request<string>(`/api/thumbnails/${documentId}`, {
        headers: { "Cache-Control": "max-age=300" },
      }),
  },

  // -------------------------------------------------------------------------
  // Embed (HTML rendering)
  // -------------------------------------------------------------------------
  embed: {
    /** POST /api/embed — returns raw HTML text */
    render: (state: SerializedEditorState): Promise<string> =>
      requestText("/api/embed", { method: "POST", ...json(state) }),
  },

  // -------------------------------------------------------------------------
  // Notes
  // -------------------------------------------------------------------------
  notes: {
    /** GET /api/notes/canvas */
    getCanvas: (): Promise<NotesCanvas | undefined> =>
      request<NotesCanvas>("/api/notes/canvas"),

    /** POST /api/notes */
    create: (note: CreateNoteInput): Promise<unknown> =>
      request<unknown>("/api/notes", { method: "POST", ...json(note) }),
  },

  // -------------------------------------------------------------------------
  // Copilot conversations
  // -------------------------------------------------------------------------
  copilotThreads: {
    /** GET /api/copilot/threads?scope=… */
    list: (scope: string): Promise<CopilotThread[] | undefined> =>
      request<CopilotThread[]>(
        `/api/copilot/threads?scope=${encodeURIComponent(scope)}`,
      ),

    /** PUT /api/copilot/threads — upsert; the client owns the id. */
    save: (thread: CopilotThreadInput): Promise<CopilotThread | undefined> =>
      request<CopilotThread>("/api/copilot/threads", {
        method: "PUT",
        ...json(thread),
      }),

    /** DELETE /api/copilot/threads/[id] */
    delete: (id: string): Promise<{ id: string } | undefined> =>
      request<{ id: string }>(`/api/copilot/threads/${id}`, {
        method: "DELETE",
      }),
  },
} as const;
