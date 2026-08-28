"use client";
import { createContext, type ReactNode, useContext } from "react";

const DocumentIdContext = createContext<string | null>(null);

/**
 * Which document *this* editor is editing.
 *
 * Every consumer below used to answer that by parsing
 * `window.location.pathname` (docs/plans/workspace-url.md §4.1) — a derived,
 * eventually-consistent copy of a value the store already holds. It was wrong
 * twice over: on a handle URL (`/edit/my-post`) the parser matched nothing and
 * attaching a file failed with "Document ID not found", and in a split the
 * address bar names only the focused pane, so an upload started in the other
 * pane would attach to the wrong document.
 *
 * It is a context rather than `selectFocusedDocId` for that second reason:
 * global focus is one document and there can be two editors mounted.
 * `ConnectedEditor` is mounted once per open document and therefore already
 * holds the answer at exactly the granularity the consumers need.
 *
 * **The value is always a document id.** The URL parser this replaces returned
 * an id *or* a handle on purpose: insisting on a 36-character uuid is what lost
 * the handle case, and every server route taking a document reference resolves
 * both (`requireDocument` is documented as accepting "document id or handle"),
 * so validation belongs at the point that can actually resolve the reference.
 * That reasoning still holds for a reference arriving from outside — it just no
 * longer applies here, because a `Post.id` read from the store is already the
 * resolved form. The handle case is gone at the source rather than handled.
 *
 * `null` means there is no editor host above — an editor mounted outside a
 * `ConnectedEditor`, or a test — and callers must read it as "there is nothing
 * to upload to" rather than assume a document.
 */
export const EditorDocumentProvider = (
  { documentId, children }: { documentId: string | null; children: ReactNode },
) => (
  <DocumentIdContext.Provider value={documentId}>
    {children}
  </DocumentIdContext.Provider>
);

/**
 * The id of the document the surrounding editor is editing, or `null` when the
 * editor is not hosted by a `ConnectedEditor`.
 */
export const useEditorDocumentId = (): string | null =>
  useContext(DocumentIdContext);
