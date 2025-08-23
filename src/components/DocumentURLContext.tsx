"use client";
import React, { createContext, useContext } from "react";
import { UserDocument } from "@/types";

interface DocumentURLContextProps {
  getDocumentUrl: (doc: UserDocument) => string;
}

// Create the context with a default implementation that just goes to regular routes
const DocumentURLContext = createContext<DocumentURLContextProps>({
  getDocumentUrl: (doc: UserDocument) => {
    const docId = doc.id;
    return `/view/${docId}`; // All documents are posts now
  },
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
