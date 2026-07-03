import { createSelector } from "@reduxjs/toolkit";
import { documentsSelectors, type RootState } from "@/store";
import { compareDocumentsByRank } from "@/lib/documentOrder";
import type { UserDocument } from "@/types";

/* ------------------------------------------------------------------ */
/*  SideBar                                                            */
/* ------------------------------------------------------------------ */

const selectAllDocuments = (state: RootState) =>
  documentsSelectors.selectAll(state);

const selectUser = (state: RootState) => state.user;

/**
 * Memoized selector: root documents owned by the current user.  Re-computes
 * only when the full document list or user reference changes — prevents the
 * sidebar from re-rendering on every unrelated document mutation that doesn't
 * affect the filtered result set.
 */
export const selectUserFilteredDocuments = createSelector(
  [selectAllDocuments, selectUser],
  (documents, user): UserDocument[] => {
    if (!user || !documents) return [];
    return documents.filter((doc) => {
      const cloudDocument = doc.cloud;
      const localDocument = doc.local;
      if (cloudDocument) {
        return (
          cloudDocument.author.id === user.id &&
          !cloudDocument.parentId
        );
      }
      if (localDocument) {
        return !localDocument.parentId;
      }
      return false;
    });
  },
);

/**
 * Memoized selector grouping child documents (tabs) by their parent id, ordered
 * by manual `rank`.  A tabbed post is modelled as a root document with one child
 * per extra tab (see `mergeCloudDocumentsIntoTabs`).  The sidebar reads from
 * here so it can render a post's tabs from the store regardless of which
 * document is currently open — the live `ui.tabs` slice only knows the open one.
 */
export const selectChildDocumentsByParent = createSelector(
  [selectAllDocuments],
  (documents): Map<string, UserDocument[]> => {
    const map = new Map<string, UserDocument[]>();
    for (const doc of documents) {
      const data = doc.cloud || doc.local;
      const parentId = data?.parentId;
      if (!parentId) continue;
      const siblings = map.get(parentId);
      if (siblings) siblings.push(doc);
      else map.set(parentId, [doc]);
    }
    for (const siblings of map.values()) {
      siblings.sort(compareDocumentsByRank);
    }
    return map;
  },
);
