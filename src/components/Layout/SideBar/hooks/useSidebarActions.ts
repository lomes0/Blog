import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import { buildPostCreateInput, UNTITLED_POST } from "@/lib/newPost";
import {
  actions,
  postsSelectors,
  type RootState,
  useDispatch,
  useSelector,
} from "@/store";
import { MAX_PANES, type Post, type Project, type Series } from "@/types";
import { type ContextMenuState, useContextMenu } from "@/hooks/useContextMenu";
import {
  type InlineRenameResult,
  useInlineRename,
} from "@/hooks/useInlineRename";
import { documentCommands, paneCommands, seriesCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";
import { useCloseDeletedDocument } from "@/hooks/useCloseDeletedDocument";

/**
 * Which field a post's inline rename writes to. The root document doubles as the
 * post and its first tab, so the post row renames `name` (the post title) while
 * the first sub-tab renames `tabLabel` (the tab's own label) — both keyed by the
 * same id, so the field disambiguates which is being edited.
 */
export type RenameField = "name" | "tabLabel";

/** Rename machinery for the rows of one entity type, plus their right-click menu. */
export interface RowActions<C = undefined> {
  rename: InlineRenameResult<C>;
  /** Right-click handler for a row of this entity type. */
  openContextMenu: (event: React.MouseEvent, id: string) => void;
}

/**
 * Post rows and sub-tabs. Renaming is field-discriminated (see
 * {@link RenameField}); everything else is the shared row machinery.
 */
export interface PostItemActions extends RowActions<RenameField> {
  /**
   * Create a post, inline-rename it, and open it once the name is settled.
   * Pass a `seriesId` to create it inside that series rather than at the root.
   */
  handleCreatePost: (seriesId?: string | null) => Promise<void>;
}

/**
 * Series headers. A series has no editor document, so "Edit" opens the series
 * edit form and "Rename" inline-edits the series title (via `updateSeries`).
 */
export interface SeriesItemActions extends RowActions {
  /**
   * Create a series and drop straight into inline rename on the new header.
   * Pass a `projectId` to create it inside that project rather than at the root.
   */
  handleCreateSeries: (projectId?: string | null) => Promise<void>;
}

/**
 * Project headers. A project has no editor document and no detail page, so it
 * supports inline rename (via `updateProject`) and delete (which frees its
 * series to root); there is no "Edit" action.
 */
export interface ProjectItemActions extends RowActions {
  /** Create a project and drop straight into inline rename on the new header. */
  handleCreateProject: () => Promise<void>;
}

/** The menu itself: where it sits, and what its items do. */
export interface RowContextMenu {
  contextMenu: ContextMenuState<string> | null;
  close: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}

/** A menu whose entity has a page to open, so it carries an "Edit" item too. */
export interface EditableRowContextMenu extends RowContextMenu {
  onEdit: (id: string) => void;
}

/**
 * A post's menu can also open it beside whatever is already open. Absent when
 * the workspace has no room for a second pane — see `MAX_PANES`.
 */
export interface PostRowContextMenu extends EditableRowContextMenu {
  onOpenToSide?: (postId: string) => void;
}

/** A series' menu can also create a post inside it. */
export interface SeriesRowContextMenu extends EditableRowContextMenu {
  onNewPost: (seriesId: string) => void;
}

/** A project's menu can also create a series inside it. */
export interface ProjectRowContextMenu extends RowContextMenu {
  onNewSeries: (projectId: string) => void;
}

export interface SidebarActionsResult {
  postActions: PostItemActions;
  seriesActions: SeriesItemActions;
  projectActions: ProjectItemActions;
  postMenu: PostRowContextMenu;
  seriesMenu: SeriesRowContextMenu;
  /** Projects have no detail page, so no "Edit". */
  projectMenu: ProjectRowContextMenu;
}

/** Title a post's inline field opens with, per renamed field. */
function postTitle(post: Post, field: RenameField): string {
  const name = post.title || "Untitled";
  // The first tab's label can differ from the post title; fall back to it.
  return field === "tabLabel" ? post.tabLabel ?? name : name;
}

export function useSidebarActions(): SidebarActionsResult {
  const dispatch = useDispatch();
  const router = useRouter();
  const run = useCommandRun();
  const closeDeleted = useCloseDeletedDocument();
  const documents = useSelector((state: RootState) =>
    postsSelectors.selectAll(state)
  );
  const series = useSelector((state: RootState) => state.series);
  const projects = useSelector((state: RootState) => state.projects);

  /**
   * Ask before destroying something. Returns whether the user confirmed; the
   * two option ids are freshly minted so a stale reply can't match.
   */
  const confirmDelete = useCallback(
    async (title: string, content: string) => {
      const cancelId = uuid();
      const confirmId = uuid();
      const response = await dispatch(
        actions.alert({
          title,
          content,
          actions: [
            { label: "Cancel", id: cancelId },
            { label: "Delete", id: confirmId },
          ],
        }),
      );
      return response.payload === confirmId;
    },
    [dispatch],
  );

  // --- Posts -----------------------------------------------------------------

  const {
    contextMenu: postContextMenu,
    open: openPostMenu,
    close: closePostMenu,
  } = useContextMenu<string>();
  /**
   * The post a "+" just created, held until its inline rename closes.
   *
   * Opening the editor at create time instead would mount the route while the
   * rename field is still up in the tree, and the editor's own autofocus would
   * take the caret out from under whoever is typing the name. Naming first and
   * navigating after keeps one focus owner at a time.
   */
  const pendingOpenRef = useRef<string | null>(null);
  const postRename = useInlineRename<Post, RenameField>({
    items: documents,
    getId: (post) => post.id,
    getTitle: postTitle,
    // Compare against the raw stored value, not `postTitle`'s "Untitled"
    // placeholder, so naming an untitled post "Untitled" for real still writes.
    getStoredTitle: (post, field) =>
      (field === "tabLabel" ? post.tabLabel : post.title) ?? "",
    initialContext: "name",
    onCommit: (post, title, field) => {
      const partial: { name?: string; tabLabel?: string } = { [field]: title };
      // Renaming the post title must not drag the first tab's label with it.
      // The first tab falls back to the post `name` until `tabLabel` is set, so
      // when renaming a tabbed post's title we pin the first tab to its current
      // label by seeding `tabLabel` with the old name. Single-tab posts have no
      // separate first-tab item, so their heading keeps following the post name.
      if (field === "name") {
        const hasTabs = documents.some((doc) => doc.parentId === post.id);
        if (hasTabs && !post.tabLabel && post.title) {
          partial.tabLabel = post.title;
        }
      }
      dispatch(actions.updatePost({ id: post.id, partial }));
    },
    // Whether or not a name was typed, the post exists — so a cancelled rename
    // opens it too rather than stranding an "Untitled Document" in the tree.
    onEnd: (id) => {
      if (pendingOpenRef.current !== id) return;
      pendingOpenRef.current = null;
      run(documentCommands.open, { id });
    },
  });
  const {
    start: startPostRename,
    startWith: startPostRenameWith,
  } = postRename;

  const handleEditPost = useCallback(
    (postId: string) => {
      closePostMenu();
      run(documentCommands.open, { id: postId });
    },
    [run, closePostMenu],
  );

  // Splitting needs a workspace to split: panes exist only while the editor is
  // mounted, and there is room for exactly one more. The command refuses either
  // way; hiding the item is so the menu never offers a dead end.
  const canSplit = useSelector(
    (state: RootState) =>
      state.ui.workspace.panes.length > 0 &&
      state.ui.workspace.panes.length < MAX_PANES,
  );

  const handleOpenPostToSide = useCallback(
    (postId: string) => {
      closePostMenu();
      run(paneCommands.split, { id: postId });
    },
    [run, closePostMenu],
  );

  const handleRenamePostFromMenu = useCallback(
    (postId: string) => {
      closePostMenu();
      startPostRename(postId, "name");
    },
    [closePostMenu, startPostRename],
  );

  const handleDeletePost = useCallback(
    async (postId: string) => {
      closePostMenu();
      const confirmed = await confirmDelete(
        "Delete Post",
        "Are you sure you want to delete this post?",
      );
      if (!confirmed) return;
      if (!documents?.some((doc) => doc.id === postId)) return;
      try {
        await dispatch(actions.deletePost(postId)).unwrap();
        // Before the refresh: the sidebar is on screen *while* a pane may be
        // showing what was just deleted, so this is the one delete surface
        // where the workspace half is the common case rather than the corner.
        closeDeleted(postId);
        router.refresh();
      } catch {
        // delete failed, skip refresh
      }
    },
    [dispatch, closePostMenu, confirmDelete, documents, router, closeDeleted],
  );

  const handleCreatePost = useCallback(
    async (seriesId?: string | null) => {
      try {
        const payload = buildPostCreateInput({
          title: UNTITLED_POST,
          // A post born from a "+" is a draft. `/new` shows the visibility
          // checkboxes before anything is created; a one-click affordance has no
          // such moment, and `published && !private` is exactly the pair that
          // puts a document in the public listing, the author's profile and the
          // sitemap (`repositories/document.ts`). Publishing stays a decision
          // the author makes on purpose, from the post's own settings.
          published: false,
          private: false,
          collab: false,
          seriesId: seriesId ?? null,
          // The sidebar's "+" is a here-and-now affordance: the row it creates
          // goes to the top of its container, where the author is looking and
          // where the rename it opens is on screen — not appended below a list
          // that may be scrolled out of view.
          placement: "start",
        });
        await dispatch(actions.createPost(payload)).unwrap();
        // Seed the rename explicitly — this closure's `documents` predates the
        // new row, so `start` would find nothing to read a title off.
        pendingOpenRef.current = payload.id;
        startPostRenameWith(payload.id, UNTITLED_POST, "name");
      } catch {
        // Create failed; the thunk already surfaced an announcement.
      }
    },
    [dispatch, startPostRenameWith],
  );

  // --- Series ----------------------------------------------------------------

  // Series and project headers nest inside right-clickable rows, so their menus
  // must not let the event reach the ancestor's handler.
  const {
    contextMenu: seriesContextMenu,
    open: openSeriesMenu,
    close: closeSeriesMenu,
  } = useContextMenu<string>({ stopPropagation: true });
  const seriesRename = useInlineRename<Series, undefined>({
    items: series,
    getId: (item) => item.id,
    getTitle: (item) => item.title || "",
    initialContext: undefined,
    onCommit: (item, title) => {
      dispatch(actions.updateSeries({ id: item.id, data: { title } }));
    },
  });
  const {
    start: startSeriesRename,
    startWith: startSeriesRenameWith,
  } = seriesRename;

  const handleEditSeries = useCallback(
    (seriesId: string) => {
      closeSeriesMenu();
      run(seriesCommands.edit, { id: seriesId });
    },
    [run, closeSeriesMenu],
  );

  const handleNewPostFromSeriesMenu = useCallback(
    (seriesId: string) => {
      closeSeriesMenu();
      handleCreatePost(seriesId);
    },
    [closeSeriesMenu, handleCreatePost],
  );

  const handleRenameSeriesFromMenu = useCallback(
    (seriesId: string) => {
      closeSeriesMenu();
      startSeriesRename(seriesId);
    },
    [closeSeriesMenu, startSeriesRename],
  );

  const handleDeleteSeries = useCallback(
    async (seriesId: string) => {
      closeSeriesMenu();
      const confirmed = await confirmDelete(
        "Delete Series",
        "Delete this series? Posts will not be deleted.",
      );
      if (!confirmed) return;
      await dispatch(actions.deleteSeries(seriesId));
      router.refresh();
    },
    [dispatch, closeSeriesMenu, confirmDelete, router],
  );

  const handleCreateSeries = useCallback(
    async (projectId?: string | null) => {
      try {
        // Same shape as `handleCreateProject` below: create, let the reducer put
        // the row in the tree, then open its inline rename so the user just types
        // the name. Unlike the create-series drawer this does not navigate — a
        // series is a container, and being thrown to `/posts/{id}` would take you
        // out of whatever you were editing when you reached for the "+".
        const created = await dispatch(
          actions.createSeries({
            title: "New Series",
            projectId: projectId ?? null,
          }),
        ).unwrap();
        if (created?.id) {
          startSeriesRenameWith(created.id, created.title || "New Series");
        }
      } catch {
        // Create failed; the thunk already surfaced an announcement.
      }
    },
    [dispatch, startSeriesRenameWith],
  );

  // --- Projects --------------------------------------------------------------

  const {
    contextMenu: projectContextMenu,
    open: openProjectMenu,
    close: closeProjectMenu,
  } = useContextMenu<string>({ stopPropagation: true });
  const projectRename = useInlineRename<Project, undefined>({
    items: projects,
    getId: (item) => item.id,
    getTitle: (item) => item.title || "",
    initialContext: undefined,
    onCommit: (item, title) => {
      dispatch(actions.updateProject({ id: item.id, data: { title } }));
    },
  });
  const {
    start: startProjectRename,
    startWith: startProjectRenameWith,
  } = projectRename;

  const handleNewSeriesFromProjectMenu = useCallback(
    (projectId: string) => {
      closeProjectMenu();
      handleCreateSeries(projectId);
    },
    [closeProjectMenu, handleCreateSeries],
  );

  const handleRenameProjectFromMenu = useCallback(
    (projectId: string) => {
      closeProjectMenu();
      startProjectRename(projectId);
    },
    [closeProjectMenu, startProjectRename],
  );

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      closeProjectMenu();
      const confirmed = await confirmDelete(
        "Delete Project",
        "Delete this project? Its series will be kept and moved out of the project.",
      );
      if (!confirmed) return;
      await dispatch(actions.deleteProject(projectId));
      router.refresh();
    },
    [dispatch, closeProjectMenu, confirmDelete, router],
  );

  const handleCreateProject = useCallback(async () => {
    try {
      // createProject.fulfilled unshifts the project into the store, so the new
      // section header renders immediately; open its inline rename so the user
      // just types the name (IDE-style new-folder flow). Seed the title
      // explicitly — this closure's `projects` predates the new row.
      const created = await dispatch(
        actions.createProject({ title: "New Project" }),
      ).unwrap();
      if (created?.id) {
        startProjectRenameWith(created.id, created.title || "New Project");
      }
    } catch {
      // Create failed; the thunk already surfaced an announcement.
    }
  }, [dispatch, startProjectRenameWith]);

  return {
    postActions: {
      rename: postRename,
      openContextMenu: openPostMenu,
      handleCreatePost,
    },
    seriesActions: {
      rename: seriesRename,
      openContextMenu: openSeriesMenu,
      handleCreateSeries,
    },
    projectActions: {
      rename: projectRename,
      openContextMenu: openProjectMenu,
      handleCreateProject,
    },
    postMenu: {
      contextMenu: postContextMenu,
      close: closePostMenu,
      onEdit: handleEditPost,
      onOpenToSide: canSplit ? handleOpenPostToSide : undefined,
      onRename: handleRenamePostFromMenu,
      onDelete: handleDeletePost,
    },
    seriesMenu: {
      contextMenu: seriesContextMenu,
      close: closeSeriesMenu,
      onNewPost: handleNewPostFromSeriesMenu,
      onEdit: handleEditSeries,
      onRename: handleRenameSeriesFromMenu,
      onDelete: handleDeleteSeries,
    },
    projectMenu: {
      contextMenu: projectContextMenu,
      close: closeProjectMenu,
      onNewSeries: handleNewSeriesFromProjectMenu,
      onRename: handleRenameProjectFromMenu,
      onDelete: handleDeleteProject,
    },
  };
}
