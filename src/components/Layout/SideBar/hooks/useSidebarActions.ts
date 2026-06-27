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

export interface PostItemActions {
  renamingPostId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  handleContextMenu: (event: React.MouseEvent, postId: string) => void;
  handleDoubleClick: (
    event: React.MouseEvent,
    postId: string,
    currentName: string,
  ) => void;
  handleRenameBlur: () => void;
  handleRenameKeyDown: (event: React.KeyboardEvent) => void;
}

export interface SidebarActionsResult extends PostItemActions {
  contextMenu: { mouseX: number; mouseY: number; postId: string } | null;
  handleCloseContextMenu: () => void;
  handleEditPost: (postId: string) => void;
  handleRenameFromMenu: (postId: string) => void;
  handleDeletePost: (postId: string) => Promise<void>;
}

export function useSidebarActions(): SidebarActionsResult {
  const dispatch = useDispatch();
  const router = useRouter();
  const documents = useSelector((state: RootState) =>
    documentsSelectors.selectAll(state)
  );

  const [contextMenu, setContextMenu] = useState<
    {
      mouseX: number;
      mouseY: number;
      postId: string;
    } | null
  >(null);

  const [renamingPostId, setRenamingPostId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

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

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent, postId: string, currentName: string) => {
      event.preventDefault();
      setRenamingPostId(postId);
      setRenameValue(currentName);
    },
    [],
  );

  const handleRenameBlur = useCallback(() => {
    if (renamingPostId && renameValue.trim()) {
      const doc = documents?.find((d) => d.id === renamingPostId);
      if (doc) {
        const partial = { name: renameValue.trim() };
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
  }, [dispatch, renamingPostId, renameValue, documents]);

  const handleRenameKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleRenameBlur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setRenamingPostId(null);
        setRenameValue("");
      }
    },
    [handleRenameBlur],
  );

  useEffect(() => {
    if (renamingPostId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingPostId]);

  return {
    contextMenu,
    renamingPostId,
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
  };
}
