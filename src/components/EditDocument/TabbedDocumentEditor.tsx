"use client";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import React from "react";
import type { LexicalEditor } from "lexical";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
} from "@mui/material";
import { v4 as uuidv4 } from "uuid";
import { actions, postsSelectors, useDispatch, useSelector } from "@/store";
import { SetActiveEditorContext } from "@/contexts/ActiveEditorContext";
import { type TabMeta } from "@/contexts/TopBarTabsContext";
import { useTopBarTabs } from "@/contexts/TopBarTabsContext";
import EditorTabPanel from "./EditorTabPanel";
import TabContextMenu from "./TabContextMenu";
import { EMPTY_EDITOR_STATE, type PostCreateInput } from "@/types";
import { useAsyncEffect } from "@/hooks/useAsyncEffect";

interface TabbedDocumentEditorProps {
  rootId: string;
}

const TabbedDocumentEditor: React.FC<TabbedDocumentEditorProps> = ({
  rootId,
}) => {
  const dispatch = useDispatch();
  const tabs = useSelector((state) => state.ui.tabs);
  const user = useSelector((state) => state.user);

  const setActiveEditorRef = useContext(SetActiveEditorContext);
  const { setTabBar } = useTopBarTabs();

  const handleEditorReady = useCallback(
    (ref: React.RefObject<LexicalEditor | null>) => {
      setActiveEditorRef(ref);
    },
    [setActiveEditorRef],
  );

  // All root-level posts for the "Move to other post" picker.
  const allDocuments = useSelector((state) =>
    postsSelectors.selectAll(state)
  );
  const availablePosts = allDocuments.filter((doc) => {
    const d = doc;
    return d?.type === "DOCUMENT" && !d?.parentId && doc.id !== rootId;
  });

  // Which tab panels have been mounted at least once (lazy-mount pattern).
  const [_mountedTabIds, setMountedTabIds] = useState<Set<string>>(
    () => new Set([rootId]),
  );

  // Local tab metadata (name + order) mirrors Redux tab IDs.
  const [tabMetas, setTabMetas] = useState<TabMeta[]>([]);

  // Confirm-delete dialog state.
  const [deleteTarget, setDeleteTarget] = useState<TabMeta | null>(null);

  // Context menu state.
  const [contextMenuAnchor, setContextMenuAnchor] = useState<
    HTMLElement | null
  >(null);
  const [contextMenuTabId, setContextMenuTabId] = useState<string | null>(null);
  const [contextMenuIsRoot, setContextMenuIsRoot] = useState(false);

  // Externally-triggered rename (from context menu).
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);

  // Move-to-other-post dialog state.
  const [moveDialogTabId, setMoveDialogTabId] = useState<string | null>(null);
  const [moveTargetPostId, setMoveTargetPostId] = useState<string>("");

  // Load root metadata + children on mount.
  useAsyncEffect(async (isCancelled) => {
    dispatch(actions.clearTabs());

    const [rootDoc, children] = await Promise.all([
      dispatch(actions.getPost(rootId)).unwrap().catch(() => undefined),
      dispatch(actions.getPostChildren(rootId)).unwrap().catch(() => []),
    ]);

    if (isCancelled()) return;

    const childIds = (children ?? []).map((c) => c.id);
    dispatch(actions.initTabs({ rootId, childIds }));

    const metas: TabMeta[] = [
      // The root tab's label is its own `tabLabel` when set, falling back to the
      // post title (`name`). This lets the first tab be named independently of
      // the post.
      { id: rootId, name: rootDoc?.tabLabel ?? rootDoc?.name ?? "Document" },
      ...(children ?? []).map((c) => ({ id: c.id, name: c.name })),
    ];
    setTabMetas(metas);
    setMountedTabIds(new Set([rootId]));
  }, [rootId]);

  const handleSwitch = useCallback((tabId: string) => {
    setMountedTabIds((prev) => new Set([...prev, tabId]));
    dispatch(actions.setActiveTab(tabId));
  }, [dispatch]);

  const handleAdd = useCallback(async () => {
    if (!user) return;
    const now = new Date().toISOString();
    const id = uuidv4();
    const revisionId = uuidv4();

    const newDoc: PostCreateInput = {
      id,
      name: "Untitled",
      head: revisionId,
      createdAt: now,
      updatedAt: now,
      type: "DOCUMENT",
      parentId: rootId,
      data: EMPTY_EDITOR_STATE,
      revisions: [{
        id: revisionId,
        documentId: id,
        createdAt: now,
        data: EMPTY_EDITOR_STATE,
      }],
    };

    await dispatch(actions.createPost(newDoc)).unwrap();

    const newMeta: TabMeta = { id, name: "Untitled" };
    setTabMetas((prev) => [...prev, newMeta]);
    setMountedTabIds((prev) => new Set([...prev, id]));
    dispatch(actions.addTab(id));
    // Switch to the new tab (addTab does this) and open inline rename so the
    // user can name it right away.
    setRenamingTabId(id);
  }, [user, rootId, dispatch]);

  const handleCloseRequest = useCallback((tabId: string) => {
    const meta = tabMetas.find((t) => t.id === tabId);
    if (meta) setDeleteTarget(meta);
  }, [tabMetas]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);

    await dispatch(actions.deletePost(id));

    setTabMetas((prev) => prev.filter((t) => t.id !== id));
    setMountedTabIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    dispatch(actions.removeTab(id));
  }, [deleteTarget, dispatch]);

  const handleRename = useCallback(async (tabId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setTabMetas((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, name: trimmed } : t))
    );
    // Persist through the store (IndexedDB + cloud) rather than hitting the API
    // directly, so the document title rendered above the editor and the tab
    // name in the sidebar update immediately to match the renamed tab.
    // Renaming the root tab edits its own `tabLabel` so the post title (`name`)
    // stays independent; child tabs are plain docs, so their `name` is the label.
    const partial = tabId === rootId
      ? { tabLabel: trimmed }
      : { name: trimmed };
    await dispatch(actions.updatePost({ id: tabId, partial }));
  }, [dispatch, rootId]);

  const handleReorder = useCallback(async (orderedIds: string[]) => {
    const prevOrder = tabMetas.map((t) => t.id);
    if (orderedIds.join() === prevOrder.join()) return;
    dispatch(actions.reorderTabs(orderedIds));
    setTabMetas((prev) => {
      const map = new Map(prev.map((t) => [t.id, t]));
      return orderedIds.map((id) => map.get(id)!).filter(Boolean);
    });

    // Persist the moved tab's new position as a rank. Child tabs live in the
    // root tab's container; the root tab itself has no rank among children.
    // The moved tab is the one whose removal makes both orders identical.
    const movedId = orderedIds.find((id) =>
      orderedIds.filter((x) => x !== id).join() ===
        prevOrder.filter((x) => x !== id).join()
    );
    if (!movedId || movedId === rootId) return;

    const children = orderedIds.filter((id) => id !== rootId);
    const idx = children.indexOf(movedId);
    const rankOfId = (id: string) => {
      return allDocuments.find((x) => x.id === id)?.rank ?? null;
    };
    await dispatch(
      actions.movePost({
        id: movedId,
        destination: { parentId: rootId },
        between: {
          afterRank: idx > 0 ? rankOfId(children[idx - 1]) : null,
          beforeRank: idx < children.length - 1
            ? rankOfId(children[idx + 1])
            : null,
        },
      }),
    );
  }, [dispatch, tabMetas, allDocuments, rootId]);

  // ---- Context menu ----

  const handleOpenContextMenu = useCallback(
    (tabId: string, isRoot: boolean, anchor: HTMLElement) => {
      setContextMenuTabId(tabId);
      setContextMenuIsRoot(isRoot);
      setContextMenuAnchor(anchor);
    },
    [],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenuAnchor(null);
  }, []);

  // ---- Context menu actions ----

  const handleRenameFromMenu = useCallback((tabId: string) => {
    setRenamingTabId(tabId);
  }, []);

  // Cleared once the tab bar enters rename mode so the same tab can be renamed
  // again (otherwise renamingTabId stays stale and the next set is a no-op).
  const handleRenameStarted = useCallback(() => {
    setRenamingTabId(null);
  }, []);

  const handleDuplicate = useCallback(async (tabId: string) => {
    const source = allDocuments.find((d) => d.id === tabId);
    const newName = `${source?.name ?? "Copy"} (copy)`;
    const id = uuidv4();
    try {
      await dispatch(
        actions.duplicatePost({ id: tabId, newId: id, newName }),
      ).unwrap();
    } catch {
      return; // the thunk already announced the failure
    }

    const newMeta: TabMeta = { id, name: newName };
    setTabMetas((prev) => [...prev, newMeta]);
    setMountedTabIds((prev) => new Set([...prev, id]));
    dispatch(actions.addTab(id));
  }, [allDocuments, dispatch]);

  const handleMoveRequest = useCallback((tabId: string) => {
    setMoveDialogTabId(tabId);
    setMoveTargetPostId("");
  }, []);

  const handleMoveConfirm = useCallback(async () => {
    if (!moveDialogTabId || !moveTargetPostId) return;
    const tabId = moveDialogTabId;
    setMoveDialogTabId(null);

    // A re-home, not a field edit: `movePost` authorizes the destination, refuses
    // a parent cycle, and ranks the tab among its new siblings. Patching
    // `parentId` did none of those — the tab landed carrying the rank it held in
    // this post's container.
    await dispatch(
      actions.movePost({
        id: tabId,
        destination: { parentId: moveTargetPostId },
      }),
    );

    setTabMetas((prev) => prev.filter((t) => t.id !== tabId));
    setMountedTabIds((prev) => {
      const next = new Set(prev);
      next.delete(tabId);
      return next;
    });
    dispatch(actions.removeTab(tabId));
  }, [moveDialogTabId, moveTargetPostId, dispatch]);

  const handleSplitOff = useCallback(async (tabId: string) => {
    // Detach the tab from this post — it becomes a standalone document, which
    // means a move to the author's root list and a rank in it.
    await dispatch(
      actions.movePost({ id: tabId, destination: { parentId: null } }),
    );

    setTabMetas((prev) => prev.filter((t) => t.id !== tabId));
    setMountedTabIds((prev) => {
      const next = new Set(prev);
      next.delete(tabId);
      return next;
    });
    dispatch(actions.removeTab(tabId));
  }, [dispatch]);

  // Build the ordered tab list from Redux tabIds + local metadata.
  const orderedTabs = useMemo(
    () =>
      tabs.tabIds
        .map((id) => tabMetas.find((m) => m.id === id))
        .filter((m): m is TabMeta => !!m),
    [tabs.tabIds, tabMetas],
  );

  // Sync tab state into the top bar context whenever it changes.
  useEffect(() => {
    if (orderedTabs.length === 0) return;
    setTabBar({
      tabs: orderedTabs,
      activeTabId: tabs.activeTabId,
      dirtyTabIds: tabs.dirtyTabIds,
      rootTabId: rootId,
      renamingTabId: renamingTabId,
      onSwitch: handleSwitch,
      onClose: handleCloseRequest,
      onAdd: handleAdd,
      onRename: handleRename,
      onRenameStarted: handleRenameStarted,
      onReorder: handleReorder,
      onContextMenu: handleOpenContextMenu,
    });
  }, [
    orderedTabs,
    tabs.activeTabId,
    tabs.dirtyTabIds,
    rootId,
    renamingTabId,
    setTabBar,
    handleSwitch,
    handleCloseRequest,
    handleAdd,
    handleRename,
    handleRenameStarted,
    handleReorder,
    handleOpenContextMenu,
  ]);

  // Clear the top bar tab context on unmount only.
  useEffect(() => () => setTabBar(null), [setTabBar]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <Box sx={{ display: "flex", flex: 1 }}>
        <Box sx={{ flex: 1 }}>
          {tabs.tabIds.map((tabId) => (
            <EditorTabPanel
              key={tabId}
              docId={tabId}
              rootId={rootId}
              isActive={tabId === tabs.activeTabId}
              onEditorReady={tabId === tabs.activeTabId
                ? handleEditorReady
                : undefined}
            />
          ))}
        </Box>
      </Box>

      {/* Context menu */}
      <TabContextMenu
        anchorEl={contextMenuAnchor}
        tabId={contextMenuTabId}
        isRoot={contextMenuIsRoot}
        onClose={handleCloseContextMenu}
        onRename={handleRenameFromMenu}
        onDuplicate={handleDuplicate}
        onMove={handleMoveRequest}
        onSplitOff={handleSplitOff}
        onDelete={handleCloseRequest}
      />

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() =>
          setDeleteTarget(null)}
      >
        <DialogTitle>Delete tab?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {`Delete "${deleteTarget?.name}"? This cannot be undone.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Move to other post dialog */}
      <Dialog
        open={!!moveDialogTabId}
        onClose={() => setMoveDialogTabId(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Move tab to another post</DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {availablePosts.length === 0
            ? (
              <DialogContentText sx={{ p: 3 }}>
                No other posts available.
              </DialogContentText>
            )
            : (
              <List dense disablePadding>
                {availablePosts.map((doc) => {
                  const d = doc;
                  const name = d?.name ?? doc.id;
                  return (
                    <ListItemButton
                      key={doc.id}
                      selected={moveTargetPostId === doc.id}
                      onClick={() => setMoveTargetPostId(doc.id)}
                    >
                      <ListItemText primary={name} />
                    </ListItemButton>
                  );
                })}
              </List>
            )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveDialogTabId(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!moveTargetPostId}
            onClick={handleMoveConfirm}
          >
            Move
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TabbedDocumentEditor;
