import { createSelector } from "@reduxjs/toolkit";
import { documentsSelectors, RootState } from "@/store";
import { UserDocument } from "@/types";

const selectDocuments = (state: RootState) =>
  documentsSelectors.selectAll(state);
const selectSeries = (state: RootState) => state.series;

/**
 * Memoized selector that returns only standalone posts — documents that are
 * not members of any series.  Used by the /posts page to populate the "Posts"
 * section now that series are rendered separately.
 */
export const selectStandalonePosts = createSelector(
  [selectDocuments, selectSeries],
  (documents, series): UserDocument[] => {
    const seriesPostIds = new Set<string>();
    series.forEach((s) => {
      s.posts?.forEach((post) => seriesPostIds.add(post.id));
    });
    return documents.filter((doc) => {
      const docData = doc.cloud || doc.local;
      return docData?.type === "DOCUMENT" && !seriesPostIds.has(doc.id) && !docData.parentId;
    });
  },
);

/**
 * Memoized selector that builds the unified posts list from documents + series.
 * Series posts (sourced from series.posts) take precedence; remaining documents
 * that are standalone DOCUMENT-type entries are appended.
 * Re-computes only when `documents` or `series` references change.
 */
export const selectAllPosts = createSelector(
  [selectDocuments, selectSeries],
  (documents, series): UserDocument[] => {
    const seriesPostIds = new Set<string>();
    const seriesPosts: UserDocument[] = [];

    series.forEach((s) => {
      s.posts?.forEach((post) => {
        seriesPostIds.add(post.id);
        seriesPosts.push({ id: post.id, cloud: post });
      });
    });

    const standalonePosts = documents.filter((doc) => {
      const docData = doc.cloud || doc.local;
      return docData?.type === "DOCUMENT" && !seriesPostIds.has(doc.id) && !docData.parentId;
    });

    return [...seriesPosts, ...standalonePosts];
  },
);
