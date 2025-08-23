import { createAsyncThunk } from "@reduxjs/toolkit";
import { v4 as uuid } from "uuid";
import documentDB, { revisionDB } from "@/indexeddb";
import { BackupDocument, UserDocument } from "@/types";

/**
 * Duplicates an existing blog post
 */
export const duplicateDocument = createAsyncThunk(
  "app/duplicateDocument",
  async ({
    id,
    newId,
    newName,
  }: {
    id: string;
    newId: string;
    newName: string;
  }, { rejectWithValue }) => {
    try {
      // Get the original document
      const originalDoc = await documentDB.getByID(id);
      if (!originalDoc) {
        return rejectWithValue("Document not found");
      }

      // Create a copy with the new ID and name
      const duplicatedDoc = {
        ...originalDoc,
        id: newId,
        name: newName,
        head: uuid(), // Generate a new head revision ID
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Save the duplicated document
      await documentDB.add(duplicatedDoc);

      // Duplicate the current head revision
      const headRevision = await revisionDB.getByID(originalDoc.head);
      if (headRevision) {
        const duplicatedRevision = {
          ...headRevision,
          id: duplicatedDoc.head,
          documentId: newId,
          createdAt: new Date().toISOString(),
        };
        await revisionDB.add(duplicatedRevision);
      }

      // Return the duplicated document
      return duplicatedDoc;
    } catch (error) {
      return rejectWithValue("Failed to duplicate document");
    }
  },
);
