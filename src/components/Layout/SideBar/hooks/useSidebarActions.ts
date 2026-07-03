import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import {
  actions,
  documentsSelectors,
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

export interface SidebarActionsResult extends PostItemActions, SeriesItemActions {
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
}

export function useSidebarActions(): SidebarActionsResult {
  const dispatch = useDispatch();
  const router = useRouter();
  const documents = useSelector((state: RootState) =>
    documentsSelectors.selectAll(state)
  );
  const series = useSelector((state: RootState) => state.series);

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
        const docName = (doc.cloud || doc.local)?.name || "Untitled";
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
        if (doc.cloud) {
          try {
            await dispatch(actions.deleteCloudDocument(postId)).unwrap();
            router.refresh();
          } catch {
            // delete failed, skip refresh
          }
        } else if (doc.local) {
          dispatch(actions.deleteLocalDocument(postId));
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
          const effective = doc.cloud ?? doc.local;
          const hasTabs = documents.some(
            (d) => (d.cloud ?? d.local)?.parentId === renamingPostId,
          );
          if (hasTabs && effective && !effective.tabLabel && effective.name) {
            partial.tabLabel = effective.name;
          }
        }
        // Update both stores when present so the document title above the editor
        // (which reads the local copy) and the cloud stay in sync. Works for
        // child tab documents too, since they're keyed the same way.
        if (doc.local) {
          dispatch(
            actions.updateLocalDocument({ id: renamingPostId, partial }),
          );
        }
        if (doc.cloud) {
          dispatch(
            actions.updateCloudDocument({ id: renamingPostId, partial }),
          );
        }
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
  };
}
