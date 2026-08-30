"use client";
import React, { useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { documentCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";
import { Post, Series, User } from "@/types";
import { DocumentURLProvider } from "@/contexts/DocumentURLContext";
import { actions, useDispatch, useSelector } from "@/store";
import { selectStandalonePosts } from "@/store/selectors/postsSelectors";
import { selectRootOrder } from "@/store/selectors/layoutSelectors";
import { orderBy } from "@/lib/orderArray";
import { capabilities } from "@/lib/capabilities";
import useLocalStorage from "@/hooks/useLocalStorage";
import { useTimeEditing } from "@/hooks/useTimeEditing";
import { ViewToggle, type ViewType } from "@/components/shared/ViewToggle";
import { EmptyState } from "@/components/shared/EmptyState";
import DocumentCard from "@/components/DocumentCard";
import { TimeEditList } from "./components/TimeEditList";
import { type ListDensity, PostsListView } from "./components/PostsListView";
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

const PostsGrid: React.FC<{ posts: Post[]; user?: User }> = (
  { posts, user },
) => (
  <Grid container spacing={5} sx={{ mb: 4 }}>
    {posts.map((doc) => (
      <Grid key={doc.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
        <DocumentCard post={doc} user={user} />
      </Grid>
    ))}
  </Grid>
);

/**
 * Unified view for both /posts (all blog posts) and /posts/[id] (series detail).
 *
 * Series mode    – `series` prop provided. Posts come from the series object,
 *                 supports time-edit mode (compact view) for re-ordering by date.
 * All-posts mode – no `series` prop. Grid view splits into two sections:
 *                 series first, then standalone posts. Compact view uses
 *                 PostsListView, which renders standalone posts above series
 *                 (matching the sidebar's Notes-then-Projects split) while
 *                 ordering both from one shared array (`User.rootOrder`).
 */
const PostsViewContent: React.FC<PostsViewProps> = (
  { series, user: serverUser },
) => {
  const isSeries = !!series;
  // Kept for `refresh()` only — navigation goes through the command registry.
  const router = useRouter();
  const run = useCommandRun();

  const { data: session } = useSession();
  const user = serverUser ?? (session?.user as User | undefined);
  const canEdit = isSeries ? !!user && user.id === series!.authorId : !!user;

  // Separate localStorage keys so each view retains its own preference.
  const [viewType, setViewType] = useLocalStorage<ViewType>(
    isSeries ? "seriesPostsView" : "postsView",
    "grid",
  );

  // List-view display preference (persistent, shared across both modes).
  const [density] = useLocalStorage<ListDensity>(
    "postsListDensity",
    "comfortable",
  );

  // ── Drawer / dialog state ─────────────────────────────────────────────────
  const [createPostDrawerOpen, setCreatePostDrawerOpen] = useState(false);
  const [createSeriesDrawerOpen, setCreateSeriesDrawerOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // ── Redux (all-posts mode) ────────────────────────────────────────────────
  const standalonePosts = useSelector(selectStandalonePosts);
  const rootOrder = useSelector(selectRootOrder);
  const seriesList = useSelector((state) => state.series);
  const projectsList = useSelector((state) => state.projects);

  /**
   * Projects, but only where they mean something.
   *
   * Series mode renders one series' posts, so a root-list project has no place
   * in it; and `capabilities().projects` is signed-in only, so a guest gets the
   * flat list this surface used to be rather than rows they cannot act on.
   * `PostsListView` treats an empty list as "no projects" all the way down to
   * the drag engine, which is what keeps a series dragged here from having its
   * membership cleared by a surface that cannot show it.
   */
  const canUseProjects = capabilities(user).projects;
  const listProjects = canUseProjects ? projectsList : undefined;

  /**
   * Create a project and open its inline rename, the same IDE-style new-folder
   * flow the sidebar uses (`useSidebarActions.handleCreateProject`). The row
   * appears immediately because `createProject.fulfilled` unshifts it into the
   * store; naming it is the next keystroke rather than a dialog.
   */
  const dispatch = useDispatch();
  const handleCreateProject = React.useCallback(async () => {
    try {
      await dispatch(actions.createProject({ title: "New Project" })).unwrap();
      router.refresh();
    } catch {
      // Create failed; the thunk already surfaced an announcement.
    }
  }, [dispatch, router]);

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

  // Manual order is the default (series.posts arrives in the series' own
  // `postOrder` from the server); time-edit mode swaps in the
  // date-sorted-with-pending list while the user adjusts post dates.
  const seriesUserDocs: Post[] = useMemo(
    () => isSeries ? (isTimeEditMode ? sortedWithPending : series!.posts) : [],
    [isSeries, isTimeEditMode, sortedWithPending, series],
  );

  // Standalone posts in manual order — their slots in the author's root list,
  // which they share with series and projects
  // (docs/plans/ordering-simplification.md §2). The list view re-derives the
  // full interleaving from the same array; this is the grid's subset of it.
  const sortedStandalonePosts = useMemo(
    () => orderBy(rootOrder, standalonePosts),
    [rootOrder, standalonePosts],
  );

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
      {/* ── In-page header ── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          mb: { xs: 3, md: 4 },
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Typography variant="h5" component="h1" fontWeight={700}>
            {isSeries ? series!.title : "All Posts"}
          </Typography>
          {isSeries && series!.description && (
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ mt: 0.5 }}
            >
              {series!.description}
            </Typography>
          )}
          {isSeries && (
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ mt: 0.75, display: "block" }}
            >
              {series!.posts.length}{" "}
              {series!.posts.length === 1 ? "post" : "posts"}
            </Typography>
          )}
        </Box>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
            flexShrink: 0,
          }}
        >
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
          <ViewToggle view={viewType} onChange={setViewType} />
          <NewPostSplitButton
            isSeries={isSeries}
            canEdit={canEdit}
            onNewPost={isSeries
              ? () => setCreatePostDrawerOpen(true)
              : () => run(documentCommands.create)}
            onNewSeries={() => setCreateSeriesDrawerOpen(true)}
            onNewProject={!isSeries && canUseProjects
              ? handleCreateProject
              : undefined}
            onAddRemovePosts={isSeries
              ? () => setAddDialogOpen(true)
              : undefined}
          />
        </Box>
      </Box>

      {/* ── Content: series mode ── */}
      {isSeries && (
        <>
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
                    <TimeEditList
                      posts={seriesUserDocs}
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
                    rootContainer={{ seriesId: series!.id }}
                    // Series mode's top level is one series' posts, so the
                    // order array is that series' own (§2) — passing the root
                    // list's would order these rows against a list they are
                    // not in.
                    rootOrder={series!.postOrder ?? []}
                    moveTargetSeries={seriesList.filter((s) =>
                      s.id !== series!.id
                    )}
                    density={density}
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
              projects={listProjects}
              rootOrder={rootOrder}
              density={density}
            />
          );
        }

        // Grid view: separate sections — series before standalone posts
        // (matches the series-first ordering used in the sidebar).
        return (
          <>
            {hasSeries && (
              <Box component="section" sx={{ mb: { xs: 4, md: 6 } }}>
                <SectionDivider label="Series" color="secondary.main" />
                <SeriesSection series={seriesList} user={user} />
              </Box>
            )}
            {hasPosts && (
              <Box component="section">
                <SectionDivider label="Posts" color="primary.main" />
                <PostsGrid posts={sortedStandalonePosts} user={user} />
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

/**
 * Every card below this point links into the **workspace**, not to the public
 * page.
 *
 * `DocumentURLContext`'s default is `/view/[id]`, and that default is right
 * where it is still used: `User/UserDocuments` renders the same `DocumentCard`
 * on `/user/[id]`, which is a `(public)` route showing someone's published
 * posts. It was wrong here. `/posts` lists `postsSelectors` — the session's own
 * library — so a card is a door into the editor, and after Phase 4 sending it to
 * `/view/[id]` left the workspace shell entirely.
 *
 * Provided here rather than in `PostsGrid` because the same cards render through
 * two other paths on this route (`SeriesSection` → `SeriesGroupCard`, and the
 * list views), and one provider at the top of the route covers all of them —
 * whereas a per-grid provider is one more place to forget.
 *
 * The href alone is enough, with no `document.open` alongside it: there are no
 * panes to disambiguate on `/posts`. `closeAllPanes` fires when the editor
 * unmounts, so the workspace is empty here and the deep-link seam mints the
 * first pane from the URL. The pane then keeps whatever mode it is given, which
 * is the same bargain the sidebar's rail items strike.
 */
const workspaceDocumentUrl = (doc: Post) => `/edit/${doc.id}`;

const PostsView: React.FC<PostsViewProps> = (props) => (
  <DocumentURLProvider getDocumentUrl={workspaceDocumentUrl}>
    <PostsViewContent {...props} />
  </DocumentURLProvider>
);

export default PostsView;
