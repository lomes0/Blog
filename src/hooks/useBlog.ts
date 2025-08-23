import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/store";
import {
  createPost,
  createSeries,
  deletePost,
  deleteSeries,
  loadPosts,
  loadSeries,
  updatePost,
  updateSeries,
} from "@/store/app";
import { DocumentCreateInput, DocumentUpdateInput } from "@/types";

// ===== POST HOOKS =====

export const usePosts = () => {
  const posts = useSelector((state: RootState) => state.posts);
  return posts;
};

export const usePublishedPosts = () => {
  const posts = useSelector((state: RootState) => state.posts);
  // Filter for published posts only
  return posts.filter((post) => post.cloud?.published);
};

export const usePostActions = () => {
  const dispatch = useDispatch<AppDispatch>();

  return {
    loadPosts: () => dispatch(loadPosts()),
    createPost: (postData: DocumentCreateInput) =>
      dispatch(createPost(postData)),
    updatePost: (id: string, data: DocumentUpdateInput) =>
      dispatch(updatePost({ id, data })),
    deletePost: (id: string) => dispatch(deletePost(id)),
  };
};

export const usePost = (id: string) => {
  const posts = useSelector((state: RootState) => state.posts);
  return posts.find((post) => post.id === id);
};

// ===== SERIES HOOKS =====

export const useSeries = () => {
  const series = useSelector((state: RootState) => state.series);
  return series;
};

export const useSeriesActions = () => {
  const dispatch = useDispatch<AppDispatch>();

  return {
    loadSeries: () => dispatch(loadSeries()),
    createSeries: (seriesData: { title: string; description?: string }) =>
      dispatch(createSeries(seriesData)),
    updateSeries: (
      id: string,
      data: { title?: string; description?: string },
    ) => dispatch(updateSeries({ id, data })),
    deleteSeries: (id: string) => dispatch(deleteSeries(id)),
  };
};

export const useSeriesById = (id: string) => {
  const series = useSelector((state: RootState) => state.series);
  return series.find((s) => s.id === id);
};

// ===== COMBINED BLOG HOOKS =====

export const useBlogData = () => {
  const posts = usePosts();
  const series = useSeries();
  const publishedPosts = usePublishedPosts();

  return {
    posts,
    series,
    publishedPosts,
    totalPosts: posts.length,
    totalSeries: series.length,
    totalPublishedPosts: publishedPosts.length,
  };
};

export const useBlogActions = () => {
  const postActions = usePostActions();
  const seriesActions = useSeriesActions();

  return {
    ...postActions,
    ...seriesActions,
    loadBlogData: () => {
      postActions.loadPosts();
      seriesActions.loadSeries();
    },
  };
};
