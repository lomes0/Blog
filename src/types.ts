import type { SerializedEditorState } from "lexical";
import type { Session } from "next-auth";
import type { EntityState } from "@reduxjs/toolkit";

export interface Alert {
  title: string;
  content: string;
  actions: { label: string; id: string }[];
}
export interface Announcement {
  message?: { title: string; subtitle?: string };
  action?: {
    label: string;
    onClick: string;
  };
  timeout?: number;
}
export interface AttachmentPreviewState {
  open: boolean;
  nodeKey: string | null;
  url: string | null;
  filename: string | null;
  mimetype: string | null;
}

export interface TabsState {
  rootId: string | null;
  tabIds: string[];
  activeTabId: string | null;
  dirtyTabIds: string[];
}

/** Which view the left sidebar renders, switched from the activity rail. */
export type SidebarView = "explorer" | "search" | "notes";

/**
 * How an open post's latest edit is faring on its way to storage.
 *
 * `retrying` is the transient-disconnect case the save loop exists for: the edit
 * is safe in the `pendingSaves` store and will land when the network returns, so
 * the user is told to keep going rather than warned about data loss.
 */
export type SaveStatus = "idle" | "saving" | "retrying" | "error";

export interface AppState {
  user?: User;
  posts: EntityState<Post, string>;
  series: Series[];
  projects: Project[];
  ui: {
    announcements: Announcement[];
    alerts: Alert[];
    initialized: boolean;
    postsLoading: boolean;
    /** Per-post save status, keyed by post id. Absent means `idle`. */
    saveStatus: Record<string, SaveStatus>;
    drawer: boolean;
    page: number;
    diff: { open: boolean; old?: string; new?: string };
    attachmentPreview: AttachmentPreviewState | null;
    attachmentModified: { url: string; timestamp: number } | null;
    tabs: TabsState;
    copilot: { open: boolean };
    sidebarView: SidebarView;
  };
}

export type CopilotAction = {
  type: string;
  params: Record<string, unknown>;
};

export interface DocumentStorageUsage {
  id: string;
  name: string;
  size: number;
}

export enum DocumentStatus {
  ACTIVE = "ACTIVE",
  DONE = "DONE",
}

// New types for blog structure
export interface Series {
  id: string;
  title: string;
  description?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  authorId: string;
  // Optional membership in a Project. When set, this series' `rank` is scoped to
  // its project's members; when null the series lives at the author's root list.
  projectId?: string | null;
  // Manual position among the series' siblings: the project's members when
  // `projectId` is set, otherwise the author's root list (shared rank space with
  // root Documents, so posts and series interleave).
  rank?: string | null;
  author: User;
  posts: Post[];
}

// Series input types
export interface SeriesCreateInput {
  id: string;
  title: string;
  description?: string;
  authorId: string;
}

export interface SeriesUpdateInput {
  title?: string;
  description?: string;
  createdAt?: string;
}

// Project model: a named grouping of Series in the author's root list.
export interface Project {
  id: string;
  title: string;
  description?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  authorId: string;
  // Manual position in the author's root list (shared rank space with root
  // Documents and ungrouped Series, so projects, loose series and standalone
  // posts interleave).
  rank?: string | null;
  author: User;
  // Member series, ordered by rank within the project. Optional because the API
  // returns project metadata only; the client joins series to their project by
  // `series.projectId` (see the sidebar grouping selectors).
  series?: Series[];
}

// Project input types
export interface ProjectCreateInput {
  id: string;
  title: string;
  description?: string;
  authorId: string;
}

export interface ProjectUpdateInput {
  title?: string;
  description?: string;
  createdAt?: string;
}

// ── Unified document model ───────────────────────────────────────────────────
// One shape for every post, whichever backend it came from. A user is either a
// guest (posts live in IndexedDB) or signed in (posts live in the cloud), so the
// backend is decided once from the session — never carried per-document. There
// is deliberately no `origin: "local" | "cloud"` discriminator: reintroducing one
// would recreate the two-copy branching this model replaces.
// See `src/store/backend/` for the seam and `src/lib/capabilities.ts` for what
// each mode can do.

/** A revision's metadata, without its content. `author` is cloud-only. */
export type RevisionMeta = {
  id: string;
  documentId: string;
  createdAt: string | Date;
  author?: User;
};

/** A revision including its editor content. */
export type Revision = RevisionMeta & { data: SerializedEditorState };

export type Post = {
  id: string;
  name: string;
  head: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  type: "DOCUMENT";
  description?: string | null;
  handle?: string | null;
  /** Parent post when this is a tab of a tabbed post. */
  parentId?: string | null;
  baseId?: string | null;
  seriesId?: string | null;
  series?: Series | null;
  /** Manual position within its container (fractional index). */
  rank?: string | null;
  status?: DocumentStatus;
  background_image?: string | null;
  /** Label for this post's own tab in a tabbed post. */
  tabLabel?: string | null;

  /**
   * Editor content. Present when a post has been loaded for editing or viewing,
   * absent in list views — so `data === undefined` means "not loaded", not
   * "empty".
   */
  data?: SerializedEditorState;
  /** Revision metadata (no content). */
  revisions?: RevisionMeta[];

  // ── Cloud-only. Undefined for guest drafts. ──
  author?: User;
  coauthors?: User[];
  published?: boolean;
  collab?: boolean;
  private?: boolean;
};

/**
 * A post as it exists in the database.
 *
 * The cloud-only fields are optional on {@link Post} because a guest draft has
 * no author or collaborators. Server-side that ambiguity doesn't exist — every
 * row has an author — so the repositories return this narrowed shape and API
 * routes can read `post.author.id` without a null check.
 */
export type CloudPost = Post & {
  author: User;
  coauthors: User[];
  revisions: RevisionMeta[];
};

export type PostCreateInput =
  & Omit<Post, "author" | "coauthors" | "revisions">
  & {
    /** Coauthor emails — cloud only, ignored by the local backend. */
    coauthors?: string[];
    /** Seed revisions to create alongside the post. */
    revisions?: Revision[];
  };

export type PostUpdateInput = Partial<Omit<PostCreateInput, "id" | "type">>;

/** Where a post should land, plus where among its new siblings. */
export type MovePostArg = {
  id: string;
  /** Fully specifies the destination container (not a partial patch). */
  destination: { seriesId?: string | null; parentId?: string | null };
  /** Neighbour ranks to drop between; omit to append to the end. */
  between?: { afterRank?: string | null; beforeRank?: string | null };
};
// Utility for creating empty editor states
export const EMPTY_EDITOR_STATE: SerializedEditorState = {
  root: {
    children: [],
    direction: null,
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
};

export const WELCOME_NOTES_EDITOR_STATE = {
  root: {
    children: [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            text:
              "Welcome to your personal notes! This document will automatically save your changes.",
            type: "text",
            version: 1,
          },
        ],
        direction: "ltr",
        format: "",
        indent: 0,
        type: "paragraph",
        version: 1,
      },
    ],
    direction: "ltr",
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
} as unknown as SerializedEditorState;

export interface User {
  id: string;
  handle: string | null;
  name: string;
  /**
   * Only present when the viewer is entitled to it — the user themselves, or an
   * author looking at their own content.
   *
   * This is optional rather than required because public payloads genuinely do
   * not carry it. While it was typed as always-present, every query that fed a
   * public surface had to select it to satisfy the compiler, which is how
   * anonymous listings ended up disclosing the email of every author.
   */
  email?: string;
  image: string | null;
}

export type GetSessionResponse = Session | null;

export interface GetUsersResponse {
  data?: User[];
  error?: { title: string; subtitle?: string };
}

export interface GetUserResponse {
  data?: User;
  error?: { title: string; subtitle?: string };
}

export type UserUpdateInput = Partial<User>;
export interface PatchUserResponse {
  data?: User;
  error?: { title: string; subtitle?: string };
}

export interface DeleteUserResponse {
  data?: string;
  error?: { title: string; subtitle?: string };
}

export interface GetDocumentsResponse {
  data?: Post[];
  error?: { title: string; subtitle?: string };
}

export interface GetDocumentStorageUsageResponse {
  data?: DocumentStorageUsage[];
  error?: { title: string; subtitle?: string };
}
export interface PostDocumentsResponse {
  data?: Post | null;
  error?: { title: string; subtitle?: string };
}

export interface GetPublishedDocumentsResponse {
  data?: Post[];
  error?: { title: string; subtitle?: string };
}

export interface GetDocumentResponse {
  data?: Post;
  error?: { title: string; subtitle?: string };
}

export interface GetDocumentThumbnailResponse {
  data?: string | null;
  error?: { title: string; subtitle?: string };
}

export interface PatchDocumentResponse {
  data?: Post | null;
  error?: { title: string; subtitle?: string };
}

export interface UploadBackgroundImageResponse {
  data?: {
    background_image: string;
    document: Document;
  };
  error?: { title: string; subtitle?: string };
}

export interface DeleteDocumentResponse {
  data?: string;
  error?: { title: string; subtitle?: string };
}

export interface ForkDocumentResponse {
  data?: Post;
  error?: { title: string; subtitle?: string };
}

export interface CheckHandleResponse {
  data?: boolean;
  error?: { title: string; subtitle?: string };
}

export interface GetRevisionResponse {
  data?: Revision;
  error?: { title: string; subtitle?: string };
}

export interface PostRevisionResponse {
  data?: RevisionMeta;
  error?: { title: string; subtitle?: string };
}

export interface DeleteRevisionResponse {
  data?: { id: string; documentId: string };
  error?: { title: string; subtitle?: string };
}

export interface Pix2textResponse {
  data?: { generated_text: string };
  error?: { title: string; subtitle?: string };
}

export interface GetSeriesResponse {
  data?: Series[];
  error?: { title: string; subtitle?: string };
}

export interface PostSeriesResponse {
  data?: Series;
  error?: { title: string; subtitle?: string };
}

export interface GetProjectsResponse {
  data?: Project[];
  error?: { title: string; subtitle?: string };
}

export interface PostProjectResponse {
  data?: Project;
  error?: { title: string; subtitle?: string };
}
