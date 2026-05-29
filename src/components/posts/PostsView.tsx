"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Series, User, UserDocument } from "@/types";
import { useSelector } from "@/store";
import { selectStandalonePosts } from "@/store/selectors/postsSelectors";
import useLocalStorage from "@/hooks/useLocalStorage";
import { useTimeEditing } from "@/hooks/useTimeEditing";
import { ViewToggle, type ViewType } from "@/components/shared/ViewToggle";
import { EmptyState } from "@/components/shared/EmptyState";
import DocumentCard from "@/components/DocumentCard";
import { PostsCompactListView } from "./components/PostsCompactListView";
import { useTopBarActions } from "@/contexts/TopBarActionsContext";
import {
  type ListDensity,
  PostsListView,
  type TagStyle,
} from "./components/PostsListView";
import { NewPostSplitButton } from "./components/NewPostSplitButton";

// Controls
import SeriesSearchAndControls from "./components/SeriesSearchAndControls";
import SeriesSection from "./components/SeriesSection";

// Drawers & dialogs
import CreatePostDrawer from "@/components/drawers/CreatePostDrawer";
import CreateSeriesDrawer from "@/components/drawers/CreateSeriesDrawer";
import AddPostsDialog from "./AddPostsDialog";

interface PostsViewProps {
  /**
   * When provided, renders in series mode; otherwise renders all posts with
   * the same series-style header and controls ("All Posts" virtual mode).
   */
  series?: Series;
  /** Server-side user session (optional; falls back to next-auth client). */
  user?: User;
}

/** Section heading with a trailing divider line (used for grid view and series mode). */
function SectionDivider({ label, color }: { label: string; color: string }) {
  return (
    <Box
      sx={{
        mb: { xs: 2, md: 3 },
        display: "flex",
        alignItems: "center",
        gap: 1.5,
      }}
    >
      <Typography
        component="h2"
        sx={{
          fontSize: "0.9rem",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
    </Box>
  );
}

function sortByDate(posts: UserDocument[]): UserDocument[] {
  return [...posts].sort((a, b) => {
    const dateA = new Date(a.cloud?.createdAt || a.local?.createdAt || 0)
      .getTime();
    const dateB = new Date(b.cloud?.createdAt || b.local?.createdAt || 0)
      .getTime();
    return dateB - dateA;
  });
}

const PostsGrid: React.FC<{ posts: UserDocument[]; user?: User }> = (
  { posts, user },
) => (
  <Grid container spacing={5} sx={{ mb: 4 }}>
    {posts.map((doc) => (
      <Grid key={doc.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
        <DocumentCard userDocument={doc} user={user} />
      </Grid>
    ))}
  </Grid>
);

/**
 * Unified view for both /posts (all blog posts) and /posts/[id] (series detail).
 *
 * Series mode    – `series` prop provided. Posts come from the series object,
 *                 supports time-edit mode (compact view) for re-ordering by date.
 * All-posts mode – no `series` prop. Posts are split into two sections:
 *                 standalone posts first, then series, both sorted by date.
 *                 Compact view uses the new PostsListView with POSTS+SERIES bands.
 */
const PostsView: React.FC<PostsViewProps> = ({ series, user: serverUser }) => {
  const isSeries = !!series;
  const router = useRouter();

  const { data: session } = useSession();
  const user = serverUser ?? (session?.user as User | undefined);
  const canEdit = isSeries ? !!user && user.id === series!.authorId : !!user;

  // Separate localStorage keys so each view retains its own preference.
  const [viewType, setViewType] = useLocalStorage<ViewType>(
    isSeries ? "seriesPostsView" : "postsView",
    "grid",
  );

  // List-view display preferences (persistent, shared across both modes).
  const [density] = useLocalStorage<ListDensity>(
    "postsListDensity",
    "comfortable",
  );
  const [tagStyle] = useLocalStorage<TagStyle>("postsListTagStyle", "filled");

  // ── Drawer / dialog state ─────────────────────────────────────────────────
  const [createPostDrawerOpen, setCreatePostDrawerOpen] = useState(false);
  const [createSeriesDrawerOpen, setCreateSeriesDrawerOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // ── Redux (all-posts mode) ────────────────────────────────────────────────
  const standalonePosts = useSelector(selectStandalonePosts);
  const seriesList = useSelector((state) => state.series);

  // ── Series time-editing (always called – hooks must be unconditional) ─────
  const {
    isTimeEditMode,
    pendingTimeChanges,
    isSavingTimeChanges,
    sortedWithPending,
    handleToggleTimeEditMode,
    handleTimeAdjust,
    handleTimeReset,
    handleSaveTimeChanges,
    handleDiscardTimeChanges,
  } = useTimeEditing(series?.posts ?? []);

  // Wrap series Document[] → UserDocument[], sorted by date.
  const seriesUserDocs: UserDocument[] = useMemo(
    () =>
      isSeries
        ? sortedWithPending.map((post) => ({
          id: post.id,
          cloud: post,
          local: undefined,
        }))
        : [],
    [isSeries, sortedWithPending],
  );

  // Standalone posts sorted newest-first (all-posts mode).
  const sortedStandalonePosts = useMemo(
    () => sortByDate(standalonePosts),
    [standalonePosts],
  );

  // ── Top bar actions ───────────────────────────────────────────────────────
  const { setActions, clearActions } = useTopBarActions();

  useEffect(() => {
    const toolbarNode = (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <ViewToggle view={viewType} onChange={setViewType} />
        <NewPostSplitButton
          isSeries={isSeries}
          canEdit={canEdit}
          onNewPost={isSeries ? () => setCreatePostDrawerOpen(true) : () => router.push("/new")}
          onNewSeries={() => setCreateSeriesDrawerOpen(true)}
          onAddRemovePosts={isSeries ? () => setAddDialogOpen(true) : undefined}
        />
        {isSeries && (
          <SeriesSearchAndControls
            viewType={viewType}
            canEdit={canEdit}
            isTimeEditMode={isTimeEditMode}
            isSavingTimeChanges={isSavingTimeChanges}
            pendingTimeChanges={pendingTimeChanges}
            onToggleTimeEdit={handleToggleTimeEditMode}
            onSaveTimeChanges={handleSaveTimeChanges}
            onDiscardTimeChanges={handleDiscardTimeChanges}
          />
        )}
      </Box>
    );

    setActions(toolbarNode);
    return () => clearActions();
  }, [
    isSeries,
    viewType,
    setViewType,
    canEdit,
    isTimeEditMode,
    isSavingTimeChanges,
    pendingTimeChanges,
    handleToggleTimeEditMode,
    handleSaveTimeChanges,
    handleDiscardTimeChanges,
    setCreatePostDrawerOpen,
    setAddDialogOpen,
    setCreateSeriesDrawerOpen,
    router,
    setActions,
    clearActions,
  ]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box
      component="main"
      sx={{
        py: { xs: 2, sm: 3, md: 4 },
        px: { xs: 1, sm: 2, md: 3, lg: 4 },
        minHeight: "50vh",
        maxWidth: "100%",
        width: "100%",
      }}
      role="main"
      aria-label={isSeries ? `Series: ${series!.title}` : "Blog posts"}
    >
      {/* ── Content: series mode ── */}
      {isSeries && (
        <>
          <Box sx={{ mb: { xs: 3, md: 4 } }}>
            <Typography variant="h5" component="h1" fontWeight={700}>
              {series!.title}
            </Typography>
            {series!.description && (
              <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
                {series!.description}
              </Typography>
            )}
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.75, display: "block" }}>
              {series!.posts.length} {series!.posts.length === 1 ? "post" : "posts"}
            </Typography>
          </Box>
          {seriesUserDocs.length === 0
            ? (
              <EmptyState
                emoji="📚"
                title="No posts in this series yet"
                description={canEdit
                  ? "Add your existing posts to organize them in this series"
                  : "This series doesn't have any posts yet"}
              />
            )
            : viewType === "compact"
            ? (
              isTimeEditMode
                ? (
                  <>
                    <SectionDivider label="Posts" color="primary.main" />
                    <PostsCompactListView
                      posts={seriesUserDocs}
                      user={user}
                      isTimeEditMode
                      pendingChanges={pendingTimeChanges}
                      onTimeAdjust={canEdit ? handleTimeAdjust : undefined}
                      onTimeReset={canEdit ? handleTimeReset : undefined}
                    />
                  </>
                )
                : (
                  <PostsListView
                    posts={seriesUserDocs}
                    series={[]}
                    user={user}
                    density={density}
                    tagStyle={tagStyle}
                  />
                )
            )
            : (
              <>
                <SectionDivider label="Posts" color="primary.main" />
                <PostsGrid posts={seriesUserDocs} user={user} />
              </>
            )}
        </>
      )}

      {/* ── Content: all-posts mode — Posts then Series ── */}
      {!isSeries && (() => {
        const hasPosts = sortedStandalonePosts.length > 0;
        const hasSeries = seriesList.length > 0;

        if (!hasPosts && !hasSeries) {
          return (
            <EmptyState
              emoji="📝"
              title="No posts yet"
              description="Start writing your first blog post and share your thoughts with the world!"
            />
          );
        }

        // List view: single component handles POSTS + SERIES sections
        if (viewType === "compact") {
          return (
            <PostsListView
              posts={sortedStandalonePosts}
              series={seriesList}
              user={user}
              density={density}
              tagStyle={tagStyle}
            />
          );
        }

        // Grid view: separate sections
        return (
          <>
            {hasPosts && (
              <Box component="section" sx={{ mb: { xs: 4, md: 6 } }}>
                <SectionDivider label="Posts" color="primary.main" />
                <PostsGrid posts={sortedStandalonePosts} user={user} />
              </Box>
            )}
            {hasSeries && (
              <Box component="section">
                <SectionDivider label="Series" color="secondary.main" />
                <SeriesSection
                  series={seriesList}
                  user={user}
                  viewType={viewType}
                />
              </Box>
            )}
          </>
        );
      })()}

      {/* ── Drawers & dialogs ── */}
      <CreatePostDrawer
        open={createPostDrawerOpen}
        onClose={() => setCreatePostDrawerOpen(false)}
        seriesId={series?.id ?? ""}
        seriesTitle={series?.title}
        onSuccess={() => router.refresh()}
      />
      <CreateSeriesDrawer
        open={createSeriesDrawerOpen}
        onClose={() => setCreateSeriesDrawerOpen(false)}
      />
      {isSeries && (
        <AddPostsDialog
          open={addDialogOpen}
          onClose={() => setAddDialogOpen(false)}
          seriesId={series!.id}
          existingPosts={series!.posts}
          onPostsAdded={() => router.refresh()}
        />
      )}
    </Box>
  );
};

export default PostsView;
