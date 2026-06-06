"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, CircularProgress } from "@mui/material";
import type { LexicalEditor, SerializedEditorState } from "lexical";
import dynamic from "next/dynamic";
import { useSelector as useReduxSelector } from "react-redux";
import ConnectedEditor from "@/components/ConnectedEditor";
import SplashScreen from "@/components/shared/SplashScreen";
import DiffView from "@/components/Diff";
import { documentsSelectors, selectIsDirty, useSelector } from "@/store";
import type { RootState } from "@/store";
import { useCloudSave } from "./hooks/useCloudSave";
import { useDirtyTracking } from "./hooks/useDirtyTracking";
import { useDocumentLoader } from "./hooks/useDocumentLoader";
import type { EditorDocument } from "@/types";
import DocumentHeader from "./DocumentHeader";
import { triggerSave } from "./saveRegistry";
import { useTopBarActions } from "@/contexts/TopBarActionsContext";
import { Save, X } from "lucide-react";

const EditDocumentInfo = dynamic(
  () => import("@/components/EditDocument/EditDocumentInfo"),
  { ssr: false },
);

/** Save button that persists the current revision(s) to the cloud. */
function SaveButton() {
  const [isSaving, setIsSaving] = useState(false);
  const isDirty = useSelector(selectIsDirty);
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await triggerSave();
    } finally {
      setIsSaving(false);
    }
  }, []);

  return (
    <Button
      size="small"
      onClick={handleSave}
      disabled={isSaving || !isDirty}
      startIcon={isSaving
        ? <CircularProgress size={14} color="inherit" />
        : <Save size={14} />}
      sx={{
        color: "text.secondary",
        textTransform: "none",
        fontWeight: 600,
        fontSize: "0.8125rem",
        px: 1.25,
      }}
    >
      Save
    </Button>
  );
}

function ensureValidDocumentData(doc: EditorDocument): EditorDocument {
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
  onDiscard?: () => void;
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
  onDiscard,
  onEditorReady,
}) => {
  const editorRef = useRef<LexicalEditor>(null);
  const { setActions, clearActions } = useTopBarActions();

  useEffect(() => {
    if (isActive) onEditorReady?.(editorRef);
  }, [isActive, onEditorReady]);

  useEffect(() => {
    if (!isActive) return;
    setActions(
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        {onDiscard && (
          <Button
            size="small"
            onClick={onDiscard}
            startIcon={<X size={14} />}
            sx={{
              color: "text.secondary",
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.8125rem",
              px: 1.25,
            }}
          >
            Discard
          </Button>
        )}
        <SaveButton />
      </Box>,
    );
    return clearActions;
  }, [isActive, onDiscard, setActions, clearActions]);
  const showDiff = useSelector((state) => state.ui.diff.open);

  // Redux document for useCloudSave (stable reference, same pattern as EditDocumentContent).
  const reduxDocument = useReduxSelector(
    (state: RootState) =>
      documentsSelectors
        .selectAll(state)
        .find((d) => d.local?.id === docId)
        ?.local,
    (a, b) => a?.id === b?.id,
  );

  const { lastSavedCloud } = useCloudSave(reduxDocument, editorRef);
  const handleEditorChange = useDirtyTracking(docId, lastSavedCloud);
  const { isLoading, error, loadedDocument } = useDocumentLoader(
    docId,
    lastSavedCloud,
  );

  const documentForEditor = useMemo(
    () => loadedDocument ? ensureValidDocumentData(loadedDocument) : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadedDocument?.id],
  );

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
            namespace={`matheditor-${docId}`}
            onChange={handleEditorChange}
            onSave={triggerSave}
            onDiscard={onDiscard}
            isActive={isActive}
          />
          <EditDocumentInfo />
        </>
      )}
    </Box>
  );
};

export default EditorTabPanel;
