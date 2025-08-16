"use client";
import type { SerializedEditorState } from "lexical";
import type { Session } from "next-auth";

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
export interface AppState {
  user?: User;
  documents: UserDocument[];
  domains: Domain[];
  ui: {
    announcements: Announcement[];
    alerts: Alert[];
    initialized: boolean;
    drawer: boolean;
    page: number;
    diff: { open: boolean; old?: string; new?: string };
  };
}

export interface DocumentStorageUsage {
  id: string;
  name: string;
  size: number;
}

export type EditorDocument = {
  id: string;
  name: string;
  head: string;
  data: SerializedEditorState;
  createdAt: string | Date;
  updatedAt: string | Date;
  handle?: string | null;
  baseId?: string | null;
  parentId?: string | null;
  domainId?: string | null;
  type: DocumentType;
  status?: DocumentStatus;
  revisions?: EditorDocumentRevision[];
  sort_order?: number | null;
  background_image?: string | null;
};

export enum DocumentType {
  DOCUMENT = "DOCUMENT",
  DIRECTORY = "DIRECTORY",
}

export enum DocumentStatus {
  NEUTRAL = "NEUTRAL",
  ACTIVE = "ACTIVE",
  DONE = "DONE",
}

// Helper functions for checking document types
export const isDirectory = (
  document: EditorDocument | Document | null | undefined,
): boolean => {
  return document?.type === DocumentType.DIRECTORY;
};

export const isRegularDocument = (
  document: EditorDocument | Document | null | undefined,
): boolean => {
  return document?.type === DocumentType.DOCUMENT;
};

export type Document = Omit<EditorDocument, "data"> & {
  author: User;
  coauthors: User[];
  revisions: DocumentRevision[];
  published?: boolean;
  collab?: boolean;
  private?: boolean;
  children?: Document[]; // Child documents (for directories)
  // Ensure parentId is explicitly included since it's in the database schema
  parentId?: string | null;
  // Legacy field kept for backward compatibility
  directory?: { id: string; documentId: string; sort_order?: number | null };
};

// Backward compatibility type
export interface Directory {
  id: string;
  documentId: string;
  sort_order?: number | null;
}

export interface Domain {
  id: string;
  slug: string;
  name: string;
  description?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  userId: string;
  color?: string;
  order?: number;
}

export type CloudDocument = Document; // Cloud documents are the same as regular documents
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
  domainId?: string | null;
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
  sort_order?: number | null;
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
export type CloudDocumentRevision = DocumentRevision; // Cloud document revisions are the same as regular document revisions
export type UserDocumentRevision = DocumentRevision;
export type LocalDocumentRevision = Partial<EditorDocumentRevision>; // Allow partial for local document revisions

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
  data?: CloudDocument[];
  error?: { title: string; subtitle?: string };
}

export interface GetDocumentStorageUsageResponse {
  data?: DocumentStorageUsage[];
  error?: { title: string; subtitle?: string };
}
export interface PostDocumentsResponse {
  data?: CloudDocument | null;
  error?: { title: string; subtitle?: string };
}

export interface GetPublishedDocumentsResponse {
  data?: CloudDocument[];
  error?: { title: string; subtitle?: string };
}

export interface GetDocumentResponse {
  data?: EditorDocument & { cloudDocument: CloudDocument };
  error?: { title: string; subtitle?: string };
}

export interface GetDocumentThumbnailResponse {
  data?: string | null;
  error?: { title: string; subtitle?: string };
}

export interface PatchDocumentResponse {
  data?: CloudDocument | null;
  error?: { title: string; subtitle?: string };
}

export interface UploadBackgroundImageResponse {
  data?: {
    background_image: string;
    document: CloudDocument;
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
