import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import {
  actions,
  postsSelectors,
  type RootState,
  useDispatch,
  useSelector,
} from "@/store";

/**
 * Which field an inline rename writes to. The root document doubles as the post
 * and its first tab, so the post row renames `name` (the post title) while the
 * first sub-tab renames `tabLabel` (the tab's own label) — both keyed by the
 * same id, so the field disambiguates which is being edited.
 */
export type RenameField = "name" | "tabLabel";

export interface PostItemActions {
  renamingPostId: string | null;
  renameField: RenameField;
  renameValue: string;
  setRenameValue: (v: string) => void;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  handleContextMenu: (event: React.MouseEvent, postId: string) => void;
  handleDoubleClick: (
    event: React.MouseEvent,
    postId: string,
    currentName: string,
    field?: RenameField,
  ) => void;
  handleRenameBlur: () => void;
  handleRenameKeyDown: (event: React.KeyboardEvent) => void;
}

/**
 * Series-row equivalents of {@link PostItemActions}. A series has no editor
 * document, so "Edit" opens the series edit form and "Rename" inline-edits the
 * series title (persisted via `updateSeries`).
 */
export interface SeriesItemActions {
  renamingSeriesId: string | null;
  seriesRenameValue: string;
  setSeriesRenameValue: (v: string) => void;
  seriesRenameInputRef: React.RefObject<HTMLInputElement | null>;
  handleSeriesContextMenu: (event: React.MouseEvent, seriesId: string) => void;
  handleSeriesDoubleClick: (
    event: React.MouseEvent,
    seriesId: string,
    currentTitle: string,
  ) => void;
  handleSeriesRenameBlur: () => void;
  handleSeriesRenameKeyDown: (event: React.KeyboardEvent) => void;
}

/**
 * Project-header equivalents of {@link SeriesItemActions}. A project has no
 * editor document and no detail page, so it supports inline rename (persisted
 * via `updateProject`) and delete (which frees its series to root); there is no
 * "Edit" action.
 */
export interface ProjectItemActions {
  renamingProjectId: string | null;
  projectRenameValue: string;
  setProjectRenameValue: (v: string) => void;
  projectRenameInputRef: React.RefObject<HTMLInputElement | null>;
  handleProjectContextMenu: (event: React.MouseEvent, projectId: string) => void;
  handleProjectDoubleClick: (
    event: React.MouseEvent,
    projectId: string,
    currentTitle: string,
  ) => void;
  handleProjectRenameBlur: () => void;
  handleProjectRenameKeyDown: (event: React.KeyboardEvent) => void;
  /** Create a project and drop straight into inline rename on the new header. */
  handleCreateProject: () => Promise<void>;
}

export interface SidebarActionsResult
  extends PostItemActions, SeriesItemActions, ProjectItemActions {
  contextMenu: { mouseX: number; mouseY: number; postId: string } | null;
  handleCloseContextMenu: () => void;
  handleEditPost: (postId: string) => void;
  handleRenameFromMenu: (postId: string) => void;
  handleDeletePost: (postId: string) => Promise<void>;
  seriesContextMenu:
    | { mouseX: number; mouseY: number; seriesId: string }
    | null;
  handleCloseSeriesContextMenu: () => void;
  handleEditSeries: (seriesId: string) => void;
  handleRenameSeriesFromMenu: (seriesId: string) => void;
  handleDeleteSeries: (seriesId: string) => Promise<void>;
  projectContextMenu:
    | { mouseX: number; mouseY: number; projectId: string }
    | null;
  handleCloseProjectContextMenu: () => void;
  handleRenameProjectFromMenu: (projectId: string) => void;
  handleDeleteProject: (projectId: string) => Promise<void>;
}

export function useSidebarActions(): SidebarActionsResult {
  const dispatch = useDispatch();
  const router = useRouter();
  const documents = useSelector((state: RootState) =>
    postsSelectors.selectAll(state)
  );
  const series = useSelector((state: RootState) => state.series);
  const projects = useSelector((state: RootState) => state.projects);

  const [contextMenu, setContextMenu] = useState<
    {
      mouseX: number;
      mouseY: number;
      postId: string;
    } | null
  >(null);

  const [renamingPostId, setRenamingPostId] = useState<string | null>(null);
  const [renameField, setRenameField] = useState<RenameField>("name");
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  // Set on Escape so the ensuing blur cancels instead of committing the rename.
  const cancelRenameRef = useRef(false);

  const [seriesContextMenu, setSeriesContextMenu] = useState<
    { mouseX: number; mouseY: number; seriesId: string } | null
  >(null);
  const [renamingSeriesId, setRenamingSeriesId] = useState<string | null>(null);
  const [seriesRenameValue, setSeriesRenameValue] = useState("");
  const seriesRenameInputRef = useRef<HTMLInputElement>(null);
  // Set on Escape so the ensuing blur cancels instead of committing the rename.
  const cancelSeriesRenameRef = useRef(false);

  const [projectContextMenu, setProjectContextMenu] = useState<
    { mouseX: number; mouseY: number; projectId: string } | null
  >(null);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(
    null,
  );
  const [projectRenameValue, setProjectRenameValue] = useState("");
  const projectRenameInputRef = useRef<HTMLInputElement>(null);
  // Set on Escape so the ensuing blur cancels instead of committing the rename.
  const cancelProjectRenameRef = useRef(false);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, postId: string) => {
      event.preventDefault();
      setContextMenu((prev) =>
        prev === null
          ? { mouseX: event.clientX + 2, mouseY: event.clientY - 6, postId }
          : null
      );
    },
    [],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleEditPost = useCallback(
    (postId: string) => {
      handleCloseContextMenu();
      router.push(`/edit/${postId}`);
    },
    [router, handleCloseContextMenu],
  );

  const handleRenameFromMenu = useCallback(
    (postId: string) => {
      handleCloseContextMenu();
      const doc = documents?.find((d) => d.id === postId);
      if (doc) {
        const docName = (doc)?.name || "Untitled";
        setRenamingPostId(postId);
        setRenameField("name");
        setRenameValue(docName);
      }
    },
    [handleCloseContextMenu, documents],
  );

  const handleDeletePost = useCallback(
    async (postId: string) => {
      handleCloseContextMenu();
      const cancelId = uuid();
      const confirmId = uuid();
      const response = await dispatch(
        actions.alert({
          title: "Delete Post",
          content: "Are you sure you want to delete this post?",
          actions: [
            { label: "Cancel", id: cancelId },
            { label: "Delete", id: confirmId },
          ],
        }),
      );
      if (response.payload !== confirmId) return;
      const doc = documents?.find((d) => d.id === postId);
      if (doc) {
        try {
          await dispatch(actions.deletePost(postId)).unwrap();
          router.refresh();
        } catch {
          // delete failed, skip refresh
        }
      }
    },
    [dispatch, handleCloseContextMenu, documents, router],
  );

  const handleSeriesContextMenu = useCallback(
    (event: React.MouseEvent, seriesId: string) => {
      event.preventDefault();
      event.stopPropagation();
      setSeriesContextMenu((prev) =>
        prev === null
          ? { mouseX: event.clientX + 2, mouseY: event.clientY - 6, seriesId }
          : null
      );
    },
    [],
  );

  const handleCloseSeriesContextMenu = useCallback(() => {
    setSeriesContextMenu(null);
  }, []);

  const handleEditSeries = useCallback(
    (seriesId: string) => {
      handleCloseSeriesContextMenu();
      router.push(`/series/${seriesId}/edit`);
    },
    [router, handleCloseSeriesContextMenu],
  );

  const handleRenameSeriesFromMenu = useCallback(
    (seriesId: string) => {
      handleCloseSeriesContextMenu();
      const target = series?.find((s) => s.id === seriesId);
      if (target) {
        setRenamingSeriesId(seriesId);
        setSeriesRenameValue(target.title || "");
      }
    },
    [handleCloseSeriesContextMenu, series],
  );

  const handleDeleteSeries = useCallback(
    async (seriesId: string) => {
      handleCloseSeriesContextMenu();
      const cancelId = uuid();
      const confirmId = uuid();
      const response = await dispatch(
        actions.alert({
          title: "Delete Series",
          content: "Delete this series? Posts will not be deleted.",
          actions: [
            { label: "Cancel", id: cancelId },
            { label: "Delete", id: confirmId },
          ],
        }),
      );
      if (response.payload !== confirmId) return;
      await dispatch(actions.deleteSeries(seriesId));
      router.refresh();
    },
    [dispatch, handleCloseSeriesContextMenu, router],
  );

  const handleSeriesDoubleClick = useCallback(
    (event: React.MouseEvent, seriesId: string, currentTitle: string) => {
      event.preventDefault();
      setRenamingSeriesId(seriesId);
      setSeriesRenameValue(currentTitle);
    },
    [],
  );

  const handleSeriesRenameBlur = useCallback(() => {
    const cancelled = cancelSeriesRenameRef.current;
    cancelSeriesRenameRef.current = false;
    if (!cancelled && renamingSeriesId && seriesRenameValue.trim()) {
      const target = series?.find((s) => s.id === renamingSeriesId);
      if (target && target.title !== seriesRenameValue.trim()) {
        dispatch(
          actions.updateSeries({
            id: renamingSeriesId,
            data: { title: seriesRenameValue.trim() },
          }),
        );
      }
    }
    setRenamingSeriesId(null);
    setSeriesRenameValue("");
  }, [dispatch, renamingSeriesId, seriesRenameValue, series]);

  const handleSeriesRenameKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Both keys commit/cancel by blurring the input: focus lands on <body>
      // before the field unmounts, so it never falls back to the row's
      // focusable ListItemButton ancestor (which would leave a stuck focus
      // ring). The blur handler does the actual commit/cancel.
      if (event.key === "Enter") {
        event.preventDefault();
        seriesRenameInputRef.current?.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelSeriesRenameRef.current = true;
        seriesRenameInputRef.current?.blur();
      }
    },
    [],
  );

  const handleProjectContextMenu = useCallback(
    (event: React.MouseEvent, projectId: string) => {
      event.preventDefault();
      event.stopPropagation();
      setProjectContextMenu((prev) =>
        prev === null
          ? { mouseX: event.clientX + 2, mouseY: event.clientY - 6, projectId }
          : null
      );
    },
    [],
  );

  const handleCloseProjectContextMenu = useCallback(() => {
    setProjectContextMenu(null);
  }, []);

  const handleRenameProjectFromMenu = useCallback(
    (projectId: string) => {
      handleCloseProjectContextMenu();
      const target = projects?.find((p) => p.id === projectId);
      if (target) {
        setRenamingProjectId(projectId);
        setProjectRenameValue(target.title || "");
      }
    },
    [handleCloseProjectContextMenu, projects],
  );

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      handleCloseProjectContextMenu();
      const cancelId = uuid();
      const confirmId = uuid();
      const response = await dispatch(
        actions.alert({
          title: "Delete Project",
          content:
            "Delete this project? Its series will be kept and moved out of the project.",
          actions: [
            { label: "Cancel", id: cancelId },
            { label: "Delete", id: confirmId },
          ],
        }),
      );
      if (response.payload !== confirmId) return;
      await dispatch(actions.deleteProject(projectId));
      router.refresh();
    },
    [dispatch, handleCloseProjectContextMenu, router],
  );

  const handleProjectDoubleClick = useCallback(
    (event: React.MouseEvent, projectId: string, currentTitle: string) => {
      event.preventDefault();
      setRenamingProjectId(projectId);
      setProjectRenameValue(currentTitle);
    },
    [],
  );

  const handleProjectRenameBlur = useCallback(() => {
    const cancelled = cancelProjectRenameRef.current;
    cancelProjectRenameRef.current = false;
    if (!cancelled && renamingProjectId && projectRenameValue.trim()) {
      const target = projects?.find((p) => p.id === renamingProjectId);
      if (target && target.title !== projectRenameValue.trim()) {
        dispatch(
          actions.updateProject({
            id: renamingProjectId,
            data: { title: projectRenameValue.trim() },
          }),
        );
      }
    }
    setRenamingProjectId(null);
    setProjectRenameValue("");
  }, [dispatch, renamingProjectId, projectRenameValue, projects]);

  const handleProjectRenameKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        projectRenameInputRef.current?.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelProjectRenameRef.current = true;
        projectRenameInputRef.current?.blur();
      }
    },
    [],
  );

  const handleCreateProject = useCallback(async () => {
    try {
      // createProject.fulfilled unshifts the project into the store, so the new
      // section header renders immediately; open its inline rename so the user
      // just types the name (IDE-style new-folder flow).
      const created = await dispatch(
        actions.createProject({ title: "New Project" }),
      ).unwrap();
      if (created?.id) {
        setRenamingProjectId(created.id);
        setProjectRenameValue(created.title || "New Project");
      }
    } catch {
      // Create failed; the thunk already surfaced an announcement.
    }
  }, [dispatch]);

  const handleDoubleClick = useCallback(
    (
      event: React.MouseEvent,
      postId: string,
      currentName: string,
      field: RenameField = "name",
    ) => {
      event.preventDefault();
      setRenamingPostId(postId);
      setRenameField(field);
      setRenameValue(currentName);
    },
    [],
  );

  const handleRenameBlur = useCallback(() => {
    const cancelled = cancelRenameRef.current;
    cancelRenameRef.current = false;
    if (!cancelled && renamingPostId && renameValue.trim()) {
      const doc = documents?.find((d) => d.id === renamingPostId);
      if (doc) {
        const partial: { name?: string; tabLabel?: string } = {
          [renameField]: renameValue.trim(),
        };
        // Renaming the post title must not drag the first tab's label with it.
        // The first tab falls back to the post `name` until `tabLabel` is set,
        // so when renaming a tabbed post's title we pin the first tab to its
        // current label by seeding `tabLabel` with the old name. Single-tab
        // posts have no separate first-tab item, so their heading keeps
        // following the post name.
        if (renameField === "name") {
          const effective = doc;
          const hasTabs = documents.some(
            (d) => (d)?.parentId === renamingPostId,
          );
          if (hasTabs && effective && !effective.tabLabel && effective.name) {
            partial.tabLabel = effective.name;
          }
        }
        dispatch(actions.updatePost({ id: renamingPostId, partial }));
      }
    }
    setRenamingPostId(null);
    setRenameValue("");
  }, [dispatch, renamingPostId, renameField, renameValue, documents]);

  const handleRenameKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Commit/cancel by blurring the input so focus lands on <body> before the
      // field unmounts, rather than falling back to the row and leaving a stuck
      // focus ring. The blur handler performs the commit (or cancel).
      if (event.key === "Enter") {
        event.preventDefault();
        renameInputRef.current?.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelRenameRef.current = true;
        renameInputRef.current?.blur();
      }
    },
    [],
  );

  useEffect(() => {
    if (renamingPostId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingPostId]);

  useEffect(() => {
    if (renamingSeriesId && seriesRenameInputRef.current) {
      seriesRenameInputRef.current.focus();
      seriesRenameInputRef.current.select();
    }
  }, [renamingSeriesId]);

  useEffect(() => {
    if (renamingProjectId && projectRenameInputRef.current) {
      projectRenameInputRef.current.focus();
      projectRenameInputRef.current.select();
    }
  }, [renamingProjectId]);

  return {
    contextMenu,
    renamingPostId,
    renameField,
    renameValue,
    setRenameValue,
    renameInputRef,
    handleContextMenu,
    handleCloseContextMenu,
    handleEditPost,
    handleRenameFromMenu,
    handleDeletePost,
    handleDoubleClick,
    handleRenameBlur,
    handleRenameKeyDown,
    seriesContextMenu,
    handleCloseSeriesContextMenu,
    handleEditSeries,
    handleRenameSeriesFromMenu,
    handleDeleteSeries,
    renamingSeriesId,
    seriesRenameValue,
    setSeriesRenameValue,
    seriesRenameInputRef,
    handleSeriesContextMenu,
    handleSeriesDoubleClick,
    handleSeriesRenameBlur,
    handleSeriesRenameKeyDown,
    projectContextMenu,
    handleCloseProjectContextMenu,
    handleRenameProjectFromMenu,
    handleDeleteProject,
    renamingProjectId,
    projectRenameValue,
    setProjectRenameValue,
    projectRenameInputRef,
    handleProjectContextMenu,
    handleProjectDoubleClick,
    handleProjectRenameBlur,
    handleProjectRenameKeyDown,
    handleCreateProject,
  };
}
