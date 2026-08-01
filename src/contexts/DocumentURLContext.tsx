"use client";
import React, { createContext, useContext } from "react";
import { Post } from "@/types";

interface DocumentURLContextProps {
  getDocumentUrl: (doc: Post) => string;
}

/**
 * The default is the **public** page, and it is only correct unprovided on a
 * `(public)` route — `User/UserDocuments` on `/user/[id]`, which renders the
 * same `DocumentCard` for someone else's published posts.
 *
 * Anything inside the workspace shell must provide its own, pointing at
 * `/edit/[id]`: since Phase 4 `/view/[id]` renders `PublicShell`, with no store,
 * no sidebar and no panes, so inheriting this default there means a card click
 * silently leaves the app. `posts/PostsView` and `DocumentBrowser` both provide.
 *
 * Kept as the default in that direction on purpose — a missing provider then
 * degrades to a working public link rather than to a workspace route that a
 * public page has no store to serve.
 */
const DocumentURLContext = createContext<DocumentURLContextProps>({
  getDocumentUrl: (doc: Post) => `/view/${doc.id}`,
});

// Custom hook to use the URL context
export const useDocumentURL = () => useContext(DocumentURLContext);

// Provider component that wraps the application and provides URL generation
export const DocumentURLProvider: React.FC<
  React.PropsWithChildren<DocumentURLContextProps>
> = ({ children, getDocumentUrl }) => {
  return (
    <DocumentURLContext.Provider value={{ getDocumentUrl }}>
      {children}
    </DocumentURLContext.Provider>
  );
};
