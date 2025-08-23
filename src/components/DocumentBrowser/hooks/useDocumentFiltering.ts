"use client";
import { useMemo } from "react";
import { DocumentType, UserDocument } from "@/types";

interface UseDocumentFilteringProps {
  documents: UserDocument[];
  directoryId?: string; // Keep for compatibility but will be unused
  domainId?: string; // Keep for compatibility but will be unused
}

interface FilteredDocuments {
  directories: UserDocument[]; // Will be empty for blog posts
  regularDocuments: UserDocument[]; // These are the blog posts
  currentDirectory: UserDocument | null; // Will be null for blog structure
}

/**
 * Custom hook to filter and categorize posts for blog structure
 * Now filters only published posts, removing directory/domain logic
 */
export const useDocumentFiltering = ({
  documents,
  directoryId,
  domainId,
}: UseDocumentFilteringProps): FilteredDocuments => {
  return useMemo(() => {
    // In blog structure, we don't have directories
    const currentDirectory = null;

    // Filter documents to only include posts (DocumentType.DOCUMENT)
    // Remove directories and domain filtering
    const regularDocuments = documents.filter((doc) => {
      const docData = doc.local || doc.cloud;
      return docData?.type === DocumentType.DOCUMENT;
    });

    // No directories in simple blog structure
    const directories: UserDocument[] = [];

    return {
      directories,
      regularDocuments,
      currentDirectory,
    };
  }, [documents]); // Remove directoryId and domainId from dependencies
};
