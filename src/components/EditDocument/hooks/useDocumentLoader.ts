"use client";
import { useState } from "react";
import { useAsyncEffect } from "@/hooks/useAsyncEffect";
import { actions, useDispatch, useSelector } from "@/store";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";
import {
  type DocumentCreateInput,
  type EditorDocument,
  WELCOME_NOTES_EDITOR_STATE,
} from "@/types";
import { v4 as uuidv4 } from "uuid";

export function useDocumentLoader(
  id: string | undefined,
  lastSavedCloud: React.MutableRefObject<string | null>,
) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ title: string; subtitle?: string }>();
  // Holds the document with real data as loaded from IndexedDB or cloud.
  // Used by EditDocumentContent to initialise the editor, bypassing the Redux
  // selector which may return a stale EMPTY_EDITOR_STATE reference due to the
  // custom equality function (a, b) => a?.id === b?.id.
  const [loadedDocument, setLoadedDocument] = useState<
    EditorDocument | undefined
  >();
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);
  const errorAnnounce = useErrorAnnounce();

  useAsyncEffect(async (isCancelled) => {
    setIsLoading(true);
    setLoadedDocument(undefined);
    setError(undefined);

    const loadDocument = async (docId: string) => {
      let editorDocument: EditorDocument | undefined;
      try {
        editorDocument = await dispatch(
          actions.getLocalDocument(docId),
        ).unwrap();
      } catch {
        // not found locally — will try cloud
      }

      if (editorDocument) {
        if (!isCancelled()) {
          setLoadedDocument(editorDocument);
          setIsLoading(false);
        }

        if (user) {
          try {
            const cloudPayload = await dispatch(
              actions.getCloudDocument(docId),
            ).unwrap();
            if (isCancelled()) return;
            const { cloudDocument: _cloud, ...cloudEditorDocument } =
              cloudPayload as ReturnType<
                typeof actions.getCloudDocument.fulfilled
              >["payload"];
            if (editorDocument.head !== cloudEditorDocument.head) {
              // Local is ahead of (or diverged from) cloud. Use the cloud
              // content as the saved baseline so live dirty tracking agrees
              // that there are unsaved changes to persist.
              lastSavedCloud.current = JSON.stringify(cloudEditorDocument.data);
              if (id) dispatch(actions.markTabDirty(id));
            } else {
              lastSavedCloud.current = JSON.stringify(editorDocument.data);
            }
          } catch {
            if (isCancelled()) return;
            if (id) dispatch(actions.markTabDirty(id));
          }
        }
      } else {
        try {
          const cloudPayload = await dispatch(
            actions.getCloudDocument(docId),
          ).unwrap() as ReturnType<
            typeof actions.getCloudDocument.fulfilled
          >["payload"];
          if (isCancelled()) return;
          const { cloudDocument: _cloud, ...cloudEditorDoc } = cloudPayload;
          lastSavedCloud.current = JSON.stringify(cloudEditorDoc.data);
          await dispatch(actions.createLocalDocument(cloudEditorDoc));
          if (!isCancelled()) {
            setLoadedDocument(cloudEditorDoc);
            setIsLoading(false);
          }
        } catch (err) {
          if (isCancelled()) return;
          if (docId === "notes" && user) {
            try {
              const now = new Date().toISOString();
              const documentId = uuidv4();
              const revisionId = uuidv4();

              const newDocument: EditorDocument = {
                id: documentId,
                name: "My Notes",
                description: "Your personal notes document",
                handle: "notes",
                createdAt: now,
                updatedAt: now,
                head: revisionId,
                type: "DOCUMENT",
                data: WELCOME_NOTES_EDITOR_STATE,
              };

              await dispatch(actions.createLocalDocument(newDocument));

              const revision = {
                id: revisionId,
                documentId: documentId,
                createdAt: now,
                data: newDocument.data,
              };

              await dispatch(actions.createLocalRevision(revision));

              const cloudDocumentPayload: DocumentCreateInput = {
                ...newDocument,
                published: false,
                private: true,
                collab: false,
              };

              await dispatch(actions.createCloudDocument(cloudDocumentPayload));
              await dispatch(actions.createCloudRevision(revision));

              if (!isCancelled()) {
                setLoadedDocument(newDocument);
                setIsLoading(false);
              }
            } catch (createErr) {
              errorAnnounce("Failed to create notes document", createErr);
              if (!isCancelled()) {
                setError({
                  title: "Failed to Create Notes",
                  subtitle: "Please try again",
                });
              }
            }
          } else {
            if (!isCancelled()) {
              setError(err as { title: string; subtitle?: string });
            }
          }
        }
      }
    };

    if (id) {
      await loadDocument(id);
    } else if (!isCancelled()) {
      setError({ title: "Document Not Found" });
    }

    return () => {
      dispatch(actions.setDiff({ open: false }));
      if (id) dispatch(actions.markTabClean(id));
    };
  }, [dispatch, user, id]);

  return { isLoading, error, loadedDocument };
}
