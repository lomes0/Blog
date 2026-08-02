"use client";
import { useCallback, useContext, useMemo, useState } from "react";
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
import PaneHeader from "./PaneHeader";
import DocumentTabs, { type TabMeta } from "./DocumentTabs";
import { ToolbarSlotTarget } from "@/contexts/ToolbarSlotContext";
import EditorTabPanel from "./EditorTabPanel";
import TabContextMenu from "./TabContextMenu";
import { EMPTY_EDITOR_STATE, type PostCreateInput } from "@/types";
import { useAsyncEffect } from "@/hooks/useAsyncEffect";
import { selectPaneById } from "@/store/selectors/layoutSelectors";

interface TabbedDocumentEditorProps {
  /**
   * The pane this editor renders. Owned by `ui.workspace` and passed in — it
   * used to be minted here, which made "one pane per mounted editor" true by
   * construction and therefore made a second pane impossible to express.
   */
  paneId: string;
  rootId: string;
}

/** Stable empty list so a paneless render doesn't churn memoised consumers. */
const EMPTY_TAB_IDS: string[] = [];

const TabbedDocumentEditor: React.FC<TabbedDocumentEditorProps> = ({
  paneId,
  rootId,
}) => {
  const dispatch = useDispatch();
  const pane = useSelector((state) => selectPaneById(state, paneId));
  const tabIds = pane?.tabIds ?? EMPTY_TAB_IDS;
  const activeTabId = pane?.activeTabId ?? null;
  const mode = pane?.mode ?? "write";
  const isPaneFocused = useSelector(
    (state) => state.ui.workspace.focusedPaneId === paneId,
  );
  const isSplit = useSelector(
    (state) => state.ui.workspace.panes.length > 1,
  );
  const dirtyDocIds = useSelector((state) => state.ui.dirtyDocIds);
  const user = useSelector((state) => state.user);

  const setActiveEditorRef = useContext(SetActiveEditorContext);

  const handleEditorReady = useCallback(
    (ref: React.RefObject<LexicalEditor | null>) => {
      setActiveEditorRef(ref);
    },
    [setActiveEditorRef],
  );

  // All root-level posts for the "Move to other post" picker.
  const allDocuments = useSelector((state) => postsSelectors.selectAll(state));
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
    const [rootDoc, children] = await Promise.all([
      dispatch(actions.getPost(rootId)).unwrap().catch(() => undefined),
      dispatch(actions.getPostChildren(rootId)).unwrap().catch(() => []),
    ]);

    if (isCancelled()) return;

    const childIds = (children ?? []).map((c) => c.id);
    dispatch(
      actions.setPaneTabs({
        paneId,
        tabIds: [rootId, ...childIds],
        activeTabId: rootId,
      }),
    );

    const metas: TabMeta[] = [
      // The root tab's label is its own `tabLabel` when set, falling back to the
      // post title (`name`). This lets the first tab be named independently of
      // the post.
      { id: rootId, name: rootDoc?.tabLabel ?? rootDoc?.name ?? "Document" },
      ...(children ?? []).map((c) => ({ id: c.id, name: c.name })),
    ];
    setTabMetas(metas);
    setMountedTabIds(new Set([rootId]));
  }, [rootId, paneId]);

  const handleSwitch = useCallback((tabId: string) => {
    setMountedTabIds((prev) => new Set([...prev, tabId]));
    dispatch(actions.setActiveTab({ paneId, tabId }));
  }, [dispatch, paneId]);

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
    dispatch(actions.addTab({ paneId, tabId: id }));
    // Switch to the new tab (addTab does this) and open inline rename so the
    // user can name it right away.
    setRenamingTabId(id);
  }, [user, rootId, dispatch, paneId]);

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
    dispatch(actions.removeTab({ paneId, tabId: id }));
  }, [deleteTarget, dispatch, paneId]);

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
    dispatch(actions.reorderTabs({ paneId, tabIds: orderedIds }));
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
  }, [dispatch, tabMetas, allDocuments, rootId, paneId]);

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
    dispatch(actions.addTab({ paneId, tabId: id }));
  }, [allDocuments, dispatch, paneId]);

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
    dispatch(actions.removeTab({ paneId, tabId }));
  }, [moveDialogTabId, moveTargetPostId, dispatch, paneId]);

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
    dispatch(actions.removeTab({ paneId, tabId }));
  }, [dispatch, paneId]);

  // Build the ordered tab list from Redux tabIds + local metadata.
  const orderedTabs = useMemo(
    () =>
      tabIds
        .map((id) => tabMetas.find((m) => m.id === id))
        .filter((m): m is TabMeta => !!m),
    [tabIds, tabMetas],
  );

  // Built once and handed down rather than rendered here: its place is under
  // the active document's *title*, which is inside the panel. Only the visible
  // panel renders it (`EditorTabPanel`).
  const tabSwitcher = orderedTabs.length > 0
    ? (
      <DocumentTabs
        tabs={orderedTabs}
        activeTabId={activeTabId}
        rootTabId={rootId}
        dirtyTabIds={dirtyDocIds}
        renamingTabId={renamingTabId}
        onSwitch={handleSwitch}
        onClose={handleCloseRequest}
        onAdd={handleAdd}
        onRename={handleRename}
        onRenameStarted={handleRenameStarted}
        onReorder={handleReorder}
        onContextMenu={handleOpenContextMenu}
      />
    )
    : null;

  // The toolbar slot is the workspace's, not this pane's: `WorkspacePanes`
  // holds the one provider, and a pane draws the target for it only while it is
  // the only pane. Split, the target is above the row (`WorkspaceToolbar`) and
  // this header is left with the focused-pane accent alone — two targets under
  // one provider would be two writers to one `slotEl`, and whichever mounted
  // last would take the toolbar.
  return (
    <>
      <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
        <PaneHeader
          isSplit={isSplit}
          isFocused={isPaneFocused}
          reserveToolbar={!isSplit && mode === "write"}
        >
          {!isSplit && <ToolbarSlotTarget />}
        </PaneHeader>
        {
          /* `minWidth: 0` on both, or the document sets the pane's width
            instead of the other way round: a flex item's `min-width` defaults
            to `auto`, which is its content's minimum, so one absolutely-sized
            thing in the document — a notes board, a wide embed — becomes a
            floor the pane cannot shrink below. The pane already scrolls
            (`WorkspacePanes`), so overflowing content stays reachable. */
        }
        <Box sx={{ display: "flex", flex: 1, minWidth: 0 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {tabIds.map((tabId) => (
              <EditorTabPanel
                key={tabId}
                paneId={paneId}
                docId={tabId}
                rootId={rootId}
                mode={mode}
                isActive={tabId === activeTabId}
                isFocused={isPaneFocused && tabId === activeTabId}
                tabs={tabSwitcher}
                onEditorReady={handleEditorReady}
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
          onClose={() => setDeleteTarget(null)}
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
    </>
  );
};

export default TabbedDocumentEditor;
