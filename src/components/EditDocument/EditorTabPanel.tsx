"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Box } from "@mui/material";
import {
  CLEAR_HISTORY_COMMAND,
  type LexicalEditor,
  type SerializedEditorState,
} from "lexical";
import dynamic from "next/dynamic";
import { useSelector as useReduxSelector } from "react-redux";
import ConnectedEditor from "@/components/ConnectedEditor";
import SplashScreen from "@/components/shared/SplashScreen";
import DiffView from "@/components/Diff";
import { postsSelectors, useSelector } from "@/store";
import type { RootState } from "@/store";
import { selectPaneById } from "@/store/selectors/layoutSelectors";
import { usePostLoader } from "./hooks/usePostLoader";
import { useSave } from "./hooks/useSave";
import { useScrollMemory } from "./hooks/useScrollMemory";
import type { PaneMode, Post } from "@/types";
import DocumentHeader from "./DocumentHeader";
import PaneSkeleton from "./PaneSkeleton";
import { triggerSave } from "./saveRegistry";

const EditDocumentInfo = dynamic(
  () => import("@/components/EditDocument/EditDocumentInfo"),
  { ssr: false },
);

function ensureValidDocumentData(doc: Post): Post {
  const defaultParagraph = {
    children: [],
    direction: null,
    format: "",
    indent: 0,
    type: "paragraph",
    version: 1,
  };
  const defaultRoot: SerializedEditorState = {
    root: {
      children: [defaultParagraph],
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  };

  if (!doc.data || typeof doc.data !== "object") {
    return { ...doc, data: defaultRoot };
  }
  if (
    !doc.data.root ||
    !doc.data.root.children ||
    !Array.isArray(doc.data.root.children)
  ) {
    return { ...doc, data: defaultRoot };
  }
  if (doc.data.root.children.length === 0) {
    return {
      ...doc,
      data: {
        ...doc.data,
        root: { ...doc.data.root, children: [defaultParagraph] },
      } as SerializedEditorState,
    };
  }
  return doc;
}

interface EditorTabPanelProps {
  /** The pane this panel belongs to — its own `diffOpen`, not the focused one's. */
  paneId: string;
  docId: string;
  rootId: string;
  /** How this pane is showing its document. `read` makes Lexical non-editable. */
  mode: PaneMode;
  /** The active tab **within this pane**. Drives `display`, nothing else. */
  isActive: boolean;
  /** The active tab of the *focused* pane. Drives everything singular. */
  isFocused: boolean;
  /**
   * The pane's sub-document switcher. Handed to every panel and rendered by the
   * active one, because its place is under *this* document's title — the panel
   * is the only component that knows where that is.
   */
  tabs?: React.ReactNode;
  onEditorReady?: (ref: React.RefObject<LexicalEditor | null>) => void;
}

/**
 * Renders a single document's editor. Lazy-mounts (parent controls whether to
 * render) and hides via CSS when inactive so undo history is preserved across
 * tab switches. Each panel registers its own save callback in saveRegistry so
 * triggerSave() can save all open tabs at once.
 *
 * ## `isActive` vs `isFocused` (plan §5.1)
 *
 * This used to be one flag, because with a single pane "the visible one" and
 * "the one being acted on" were the same panel. With two panes they are not,
 * and every singleton in the editor hung off the wrong half of that:
 *
 * - **`isActive`** — the active tab of *this* pane. It gates `display`, which
 *   is the pane's own business: `display: none` rather than unmounting is what
 *   preserves undo history across a tab switch (§1.1).
 * - **`isFocused`** — the active tab of the *focused* pane, so at most one
 *   panel in the whole app has it. It gates what is genuinely singular: the
 *   `ActiveEditorContext` ref (which is what the Copilot writes through), the
 *   `<title>`, and — while split — the formatting toolbar.
 */
const EditorTabPanel: React.FC<EditorTabPanelProps> = ({
  paneId,
  docId,
  rootId,
  mode,
  isActive,
  isFocused,
  tabs,
  onEditorReady,
}) => {
  const editorRef = useRef<LexicalEditor>(null);

  useEffect(() => {
    if (isFocused) onEditorReady?.(editorRef);
  }, [isFocused, onEditorReady]);
  // This pane's diff, not the focused pane's: two panes must be able to
  // disagree about whether a revision comparison is showing.
  const showDiff = useSelector((state) =>
    selectPaneById(state, paneId)?.diffOpen ?? false
  );
  const isSplit = useSelector((state) => state.ui.workspace.panes.length > 1);

  // Who portals a toolbar into the workspace's one slot.
  //
  // Split, the slot is the band above both panes (`WorkspaceToolbar`), so the
  // claim has to be singular across the workspace: the focused pane's active
  // tab. Unsplit, the slot is this pane's own header and the pane is the only
  // one there is, so the visible tab claims it — deliberately not `isFocused`,
  // which would also make the toolbar disappear whenever the store's focused
  // pane is momentarily something other than this one.
  //
  // Read mode has no toolbar either way.
  const ownsToolbar = mode === "write" && (isSplit ? isFocused : isActive);

  // Stable reference so the save hook isn't rebuilt on every unrelated change.
  const reduxPost = useReduxSelector(
    (state: RootState) => postsSelectors.selectById(state, docId),
    (a, b) => a?.id === b?.id,
  );

  const { save, savedBaseline, track: handleEditorChange } = useSave(
    reduxPost,
    editorRef,
  );
  const { isLoading, error, loadedPost, restoredFromPending } = usePostLoader(
    docId,
    savedBaseline,
  );

  const handleReset = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const dataStr = savedBaseline.current ??
      (loadedPost?.data ? JSON.stringify(loadedPost.data) : null);
    if (!dataStr) return;
    try {
      const newState = editor.parseEditorState(dataStr);
      editor.setEditorState(newState);
      editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    } catch (e) {
      console.error("Failed to reset editor state:", e);
    }
  }, [editorRef, savedBaseline, loadedPost]);

  const documentForEditor = useMemo(
    () => loadedPost ? ensureValidDocumentData(loadedPost) : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadedPost?.id],
  );

  // Return the document to where it was left. Gated on `documentForEditor`
  // rather than on the panel mounting: before it there is nothing in the
  // scroller to scroll to, so a restore would assign into a one-screen-tall box
  // and clamp to the top.
  const scrollAnchorRef = useScrollMemory(docId, isActive, !!documentForEditor);

  // Deliver content recovered from the unconfirmed-save buffer.
  //
  // The loader restores it but cannot save it — at that point the editor has not
  // mounted, so there is no state to read. This effect runs after ConnectedEditor
  // has (child effects fire first, so `editorRef` is populated), which is the
  // earliest the save can actually see the recovered content. Without it the edit
  // would wait for the next keystroke, an `online` event that already fired, or
  // unmount.
  const flushedPendingFor = useRef<string | null>(null);
  useEffect(() => {
    if (!restoredFromPending || !documentForEditor) return;
    if (flushedPendingFor.current === documentForEditor.id) return;
    flushedPendingFor.current = documentForEditor.id;
    void save();
  }, [restoredFromPending, documentForEditor, save]);

  return (
    <Box ref={scrollAnchorRef} sx={{ display: isActive ? "block" : "none" }}>
      {error && <SplashScreen title={error.title} subtitle={error.subtitle} />}
      {
        /* No toolbar band: `PaneHeader` is mounted above this and is already
          reserving that height. A `SplashScreen` here used to cover the whole
          application — it is `position: fixed; inset: 0` — while one pane
          fetched one document. */
      }
      {isLoading && !documentForEditor && <PaneSkeleton />}
      {documentForEditor && (
        <>
          {/* One tab in one pane names the page. */}
          {isFocused && <title>{documentForEditor.name}</title>}
          <DocumentHeader docId={docId} rootId={rootId}>
            {
              /* Only the visible panel draws them — the others are `display:
                none`, and one row of tabs per hidden tab is still N rows. */
            }
            {isActive && tabs}
          </DocumentHeader>
          {showDiff && isActive && <DiffView />}
          <ConnectedEditor
            document={documentForEditor}
            editorRef={editorRef}
            namespace={`blog-simple-${docId}`}
            onChange={handleEditorChange}
            onSave={triggerSave}
            onReset={handleReset}
            editable={mode === "write"}
            // Whether this editor's `ToolbarPlugin` portals into the workspace's
            // toolbar slot — see `ownsToolbar` above.
            isActive={ownsToolbar}
          />
          <EditDocumentInfo />
        </>
      )}
    </Box>
  );
};

export default EditorTabPanel;
