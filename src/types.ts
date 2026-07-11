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

export interface AppState {
  user?: User;
  documents: EntityState<UserDocument, string>;
  series: Series[];
  projects: Project[];
  ui: {
    announcements: Announcement[];
    alerts: Alert[];
    initialized: boolean;
    documentsLoading: boolean;
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

export type EditorDocument = {
  id: string;
  name: string;
  description?: string | null;
  head: string;
  data: SerializedEditorState;
  createdAt: string | Date;
  updatedAt: string | Date;
  handle?: string | null;
  baseId?: string | null;
  parentId?: string | null;
  type: "DOCUMENT";
  status?: DocumentStatus;
  revisions?: EditorDocumentRevision[];
  rank?: string | null; // Manual position within container (fractional index)
  background_image?: string | null;
  tabLabel?: string | null; // Label for this doc's own tab in a tabbed post
  seriesId?: string | null; // For blog series functionality
};

export enum DocumentStatus {
  ACTIVE = "ACTIVE",
  DONE = "DONE",
}

export type Document = Omit<EditorDocument, "data" | "revisions"> & {
  author: User;
  coauthors: User[];
  revisions: DocumentRevision[];
  published?: boolean;
  collab?: boolean;
  private?: boolean;
  // Ensure parentId is explicitly included since it's in the database schema
  parentId?: string | null;
  // Series support for blog posts
  seriesId?: string | null;
  series?: Series | null;
};

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
  posts: Document[]; // Use Document[] since these are documents from the database
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

export type UserDocument = {
  id: string;
  local?: EditorDocument;
  cloud?: Document;
}; // Document can be local, cloud, or both
export type BackupDocument = EditorDocument & {
  revisions: EditorDocumentRevision[];
  parentId?: string | null; // Explicitly include parentId for consistency
};

export type DocumentCreateInput = EditorDocument & {
  coauthors?: string[];
  published?: boolean;
  collab?: boolean;
  private?: boolean;
  baseId?: string | null;
  revisions?: EditorDocumentRevision[];
};

export type DocumentUpdateInput = Partial<EditorDocument> & {
  coauthors?: string[];
  published?: boolean;
  collab?: boolean;
  private?: boolean;
  baseId?: string | null;
  parentId?: string | null; // Explicitly include parentId for updates
  revisions?: EditorDocumentRevision[];
  background_image?: string | null;
  seriesId?: string | null; // For blog series functionality
};

export interface EditorDocumentRevision {
  id: string;
  documentId: string;
  data: SerializedEditorState;
  createdAt: string | Date;
}

export type DocumentRevision = Omit<EditorDocumentRevision, "data"> & {
  author: User;
};

// Cloud document revisions always have authors
export type CloudDocumentRevision = DocumentRevision & {
  author: User;
};

export type LocalDocumentRevision = Partial<EditorDocumentRevision>; // Allow partial for local document revisions

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
  email: string;
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
  data?: Document[];
  error?: { title: string; subtitle?: string };
}

export interface GetDocumentStorageUsageResponse {
  data?: DocumentStorageUsage[];
  error?: { title: string; subtitle?: string };
}
export interface PostDocumentsResponse {
  data?: Document | null;
  error?: { title: string; subtitle?: string };
}

export interface GetPublishedDocumentsResponse {
  data?: Document[];
  error?: { title: string; subtitle?: string };
}

export interface GetDocumentResponse {
  data?: EditorDocument & { cloudDocument: Document };
  error?: { title: string; subtitle?: string };
}

export interface GetDocumentThumbnailResponse {
  data?: string | null;
  error?: { title: string; subtitle?: string };
}

export interface PatchDocumentResponse {
  data?: Document | null;
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
  data?: UserDocument & { data: SerializedEditorState };
  error?: { title: string; subtitle?: string };
}

export interface CheckHandleResponse {
  data?: boolean;
  error?: { title: string; subtitle?: string };
}

export interface GetRevisionResponse {
  data?: EditorDocumentRevision;
  error?: { title: string; subtitle?: string };
}

export interface PostRevisionResponse {
  data?: CloudDocumentRevision;
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
