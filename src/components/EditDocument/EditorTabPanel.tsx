"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Box } from "@mui/material";
import {
  CLEAR_HISTORY_COMMAND,
  type EditorState,
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
import { selectFocusedPane } from "@/store/selectors/layoutSelectors";
import { useDirtyTracking } from "./hooks/useDirtyTracking";
import { usePostLoader } from "./hooks/usePostLoader";
import { useSave } from "./hooks/useSave";
import type { Post } from "@/types";
import DocumentHeader from "./DocumentHeader";
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
  docId: string;
  rootId: string;
  isActive: boolean;
  onEditorReady?: (ref: React.RefObject<LexicalEditor | null>) => void;
}

/**
 * Renders a single document's editor. Lazy-mounts (parent controls whether to
 * render) and hides via CSS when inactive so undo history is preserved across
 * tab switches. Each panel registers its own save callback in saveRegistry so
 * triggerSave() can save all open tabs at once.
 */
const EditorTabPanel: React.FC<EditorTabPanelProps> = ({
  docId,
  rootId,
  isActive,
  onEditorReady,
}) => {
  const editorRef = useRef<LexicalEditor>(null);

  useEffect(() => {
    if (isActive) onEditorReady?.(editorRef);
  }, [isActive, onEditorReady]);
  // Per-pane from Phase 2 on: two panes must be able to disagree about
  // whether a diff is showing. One pane today, so this is the focused one.
  const showDiff = useSelector((state) =>
    selectFocusedPane(state)?.diffOpen ?? false
  );

  // Stable reference so the save hook isn't rebuilt on every unrelated change.
  const reduxPost = useReduxSelector(
    (state: RootState) => postsSelectors.selectById(state, docId),
    (a, b) => a?.id === b?.id,
  );

  const { save, savedBaseline, track: trackSave } = useSave(
    reduxPost,
    editorRef,
  );
  const trackDirty = useDirtyTracking(docId, savedBaseline);
  const handleEditorChange = useCallback(
    (editorState: EditorState, editor: LexicalEditor) => {
      trackDirty(editorState, editor);
      trackSave(editorState, editor);
    },
    [trackDirty, trackSave],
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
    <Box sx={{ display: isActive ? "block" : "none" }}>
      {error && <SplashScreen title={error.title} subtitle={error.subtitle} />}
      {isLoading && !documentForEditor && <SplashScreen title="Loading…" />}
      {documentForEditor && (
        <>
          {isActive && <title>{documentForEditor.name}</title>}
          <DocumentHeader docId={docId} rootId={rootId} />
          {showDiff && isActive && <DiffView />}
          <ConnectedEditor
            document={documentForEditor}
            editorRef={editorRef}
            namespace={`blog-simple-${docId}`}
            onChange={handleEditorChange}
            onSave={triggerSave}
            onReset={handleReset}
            isActive={isActive}
          />
          <EditDocumentInfo />
        </>
      )}
    </Box>
  );
};

export default EditorTabPanel;
