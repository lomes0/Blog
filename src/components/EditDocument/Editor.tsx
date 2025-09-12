"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import SplashScreen from "../SplashScreen";
import {
  DocumentCreateInput,
  EditorDocument,
  EditorDocumentRevision,
} from "@/types";
import { actions, useDispatch, useSelector } from "@/store";
import { usePathname, useRouter } from "next/navigation";
import type { EditorState, LexicalEditor } from "lexical";
import { v4 as uuidv4 } from "uuid";
import dynamic from "next/dynamic";
import DiffView from "../Diff";
import { debounce } from "@mui/material/utils";
import Editor from "../Editor";
import { Fab } from "@mui/material";
import { Save } from "@mui/icons-material";
import SaveDocumentButton from "../Layout/SaveDocumentButton";

const EditDocumentInfo = dynamic(
  () => import("@/components/EditDocument/EditDocumentInfo"),
  { ssr: false },
);

const DocumentEditor: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [document, setDocument] = useState<EditorDocument>();
  const [error, setError] = useState<{ title: string; subtitle?: string }>();
  const dispatch = useDispatch();
  const pathname = usePathname();
  const router = useRouter();
  const id = pathname.split("/")[2]?.toLowerCase();
  const editorRef = useRef<LexicalEditor>(null);
  const showDiff = useSelector((state) => state.ui.diff.open);
  const user = useSelector((state) => state.user);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const lastSavedCloud = useRef<string | null>(null);

  const debouncedUpdateLocalDocument = useCallback(
    debounce((id: string, partial: Partial<EditorDocument>) => {
      dispatch(actions.updateLocalDocument({ id, partial }));
      setHasUnsavedChanges(true);
    }, 300),
    [dispatch],
  );

  // Function to save current document to cloud
  const saveToCloud = useCallback(async () => {
    if (!document || !user) return false;

    try {
      // Get the current editor state
      const editorState = editorRef.current?.getEditorState();
      if (!editorState) return false;

      const data = editorState.toJSON();
      const serializedData = JSON.stringify(data);

      // Check if the content has changed since last cloud save
      if (lastSavedCloud.current === serializedData) {
        console.log("No changes to save to cloud");
        return true; // No changes to save
      }

      // Create a new revision ID
      const revisionId = uuidv4();
      const now = new Date().toISOString();

      // Create a new revision
      const revision: EditorDocumentRevision = {
        id: revisionId,
        documentId: document.id,
        createdAt: now,
        data,
      };

      // Update the document with the new head, preserving parentId
      const documentUpdate = {
        id: document.id,
        partial: {
          head: revisionId,
          updatedAt: now,
          parentId: document.parentId, // Preserve parentId when saving to cloud
        },
      };

      // Save to cloud
      const revisionResponse = await dispatch(
        actions.createCloudRevision(revision),
      );

      if (
        revisionResponse.type === actions.createCloudRevision.fulfilled.type
      ) {
        // Then update the document to point to the new revision
        const docResponse = await dispatch(
          actions.updateCloudDocument(documentUpdate),
        );

        if (docResponse.type === actions.updateCloudDocument.fulfilled.type) {
          console.log("Document auto-saved to cloud successfully");
          lastSavedCloud.current = serializedData;
          setHasUnsavedChanges(false);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("Failed to auto-save document to cloud:", error);
      return false;
    }
  }, [document, user, dispatch, editorRef]);

  // Handle browser beforeunload event
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        // Save automatically without confirmation
        saveToCloud();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [saveToCloud, hasUnsavedChanges]);

  // Handle router navigation
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Create a custom router event handler for Next.js navigation
      const handleRouteChangeStart = (url: string) => {
        if (hasUnsavedChanges) {
          // Auto-save when navigating within the app
          saveToCloud();
        }
      };

      // Create a patched router.push method
      const originalPush = router.push;
      const originalReplace = router.replace;
      const originalBack = router.back;

      router.push = (href: string) => {
        if (hasUnsavedChanges) {
          saveToCloud().then(() => {
            originalPush(href);
          });
          return Promise.resolve(true);
        }
        return originalPush(href);
      };

      router.replace = (href: string) => {
        if (hasUnsavedChanges) {
          saveToCloud().then(() => {
            originalReplace(href);
          });
          return Promise.resolve(true);
        }
        return originalReplace(href);
      };

      router.back = () => {
        if (hasUnsavedChanges) {
          saveToCloud().then(() => {
            originalBack();
          });
          return Promise.resolve(true);
        }
        return originalBack();
      };

      return () => {
        // Restore original methods
        router.push = originalPush;
        router.replace = originalReplace;
        router.back = originalBack;

        // Final attempt to save on unmount
        if (hasUnsavedChanges) {
          saveToCloud();
        }
      };
    }
  }, [router, saveToCloud, hasUnsavedChanges]);

  // Auto-save when component unmounts
  useEffect(() => {
    return () => {
      if (hasUnsavedChanges) {
        saveToCloud();
      }
    };
  }, [saveToCloud, hasUnsavedChanges]);

  function handleChange(
    editorState: EditorState,
    editor: LexicalEditor,
    tags: Set<string>,
  ) {
    if (!document) return;
    const data = editorState.toJSON();
    const updatedDocument: Partial<EditorDocument> = {
      data,
      updatedAt: new Date().toISOString(),
      head: uuidv4(),
      parentId: document.parentId, // Preserve parentId when saving locally
    };
    try {
      const payload = JSON.parse(tags.values().next().value as string);
      if (payload.id === document.id) {
        Object.assign(updatedDocument, payload.partial);
      }
    } catch (e) {}
    debouncedUpdateLocalDocument(document.id, updatedDocument);
  }

  // Helper function to ensure document has valid editor data
  const ensureValidDocumentData = (doc: EditorDocument): EditorDocument => {
    // If data is missing or invalid, create a default state
    if (!doc.data || typeof doc.data !== "object") {
      return {
        ...doc,
        data: {
          root: {
            children: [
              {
                children: [],
                direction: null,
                format: "",
                indent: 0,
                type: "paragraph",
                version: 1,
              },
            ],
            direction: null,
            format: "",
            indent: 0,
            type: "root",
            version: 1,
          },
        } as any,
      };
    }

    // Validate that root exists and has the required structure
    if (
      !doc.data.root || !(doc.data as any).root.children ||
      !Array.isArray((doc.data as any).root.children)
    ) {
      return {
        ...doc,
        data: {
          root: {
            children: [
              {
                children: [],
                direction: null,
                format: "",
                indent: 0,
                type: "paragraph",
                version: 1,
              },
            ],
            direction: null,
            format: "",
            indent: 0,
            type: "root",
            version: 1,
          },
        } as any,
      };
    }

    // If root has no children, add an empty paragraph
    if ((doc.data as any).root.children.length === 0) {
      return {
        ...doc,
        data: {
          ...(doc.data as any),
          root: {
            ...(doc.data as any).root,
            children: [
              {
                children: [],
                direction: null,
                format: "",
                indent: 0,
                type: "paragraph",
                version: 1,
              },
            ],
          },
        } as any,
      };
    }

    return doc;
  };

  useEffect(() => {
    const loadDocument = async (id: string) => {
      const localResponse = await dispatch(actions.getLocalDocument(id));
      if (
        localResponse.type === actions.getLocalDocument.fulfilled.type
      ) {
        const editorDocument = localResponse.payload as EditorDocument;
        setDocument(ensureValidDocumentData(editorDocument));
      } else {
        const cloudResponse = await dispatch(
          actions.getCloudDocument(id),
        );
        if (
          cloudResponse.type ===
            actions.getCloudDocument.fulfilled.type
        ) {
          const { cloudDocument, ...editorDocument } = cloudResponse
            .payload as ReturnType<
              typeof actions.getCloudDocument.fulfilled
            >["payload"];
          setDocument(ensureValidDocumentData(editorDocument));
          dispatch(actions.createLocalDocument(editorDocument));
          const editorDocumentRevision = {
            id: editorDocument.head,
            documentId: editorDocument.id,
            createdAt: editorDocument.updatedAt,
            data: editorDocument.data,
          };
          dispatch(
            actions.createLocalRevision(editorDocumentRevision),
          );
        } else if (
          cloudResponse.type ===
            actions.getCloudDocument.rejected.type
        ) {
          // Special handling for "notes" - auto-create if it doesn't exist
          if (id === "notes" && user) {
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
                data: {
                  root: {
                    children: [
                      {
                        children: [
                          {
                            detail: 0,
                            format: 0,
                            mode: "normal",
                            style: "",
                            text:
                              "Welcome to your personal notes! This document will automatically save your changes.",
                            type: "text",
                            version: 1,
                          },
                        ],
                        direction: "ltr",
                        format: "",
                        indent: 0,
                        type: "paragraph",
                        version: 1,
                      },
                    ],
                    direction: "ltr",
                    format: "",
                    indent: 0,
                    type: "root",
                    version: 1,
                  },
                } as any,
              };

              // Create the document locally first
              await dispatch(actions.createLocalDocument(newDocument));

              // Create the initial revision
              const revision = {
                id: revisionId,
                documentId: documentId,
                createdAt: now,
                data: newDocument.data,
              };

              await dispatch(actions.createLocalRevision(revision));

              // Then save to cloud with additional properties
              const cloudDocumentPayload: DocumentCreateInput = {
                ...newDocument,
                published: false,
                private: true,
                collab: false,
              };

              await dispatch(actions.createCloudDocument(cloudDocumentPayload));

              // Create the revision in cloud
              await dispatch(actions.createCloudRevision(revision));

              setDocument(ensureValidDocumentData(newDocument));
            } catch (error) {
              console.error("Failed to create notes document:", error);
              setError({
                title: "Failed to Create Notes",
                subtitle: "Please try again",
              });
            }
          } else {
            setError(
              cloudResponse.payload as {
                title: string;
                subtitle?: string;
              },
            );
          }
        }
      }
    };
    id ? loadDocument(id) : setError({ title: "Document Not Found" });
    return () => {
      dispatch(actions.setDiff({ open: false }));
    };
  }, [dispatch, user]);

  const handleSaveAndNavigate = useCallback(async () => {
    const success = await saveToCloud();
    if (success && document) {
      // Navigate to the view route after saving
      const handle = document.handle || document.id;
      router.push(`/view/${handle}`);
    }
    return success;
  }, [saveToCloud, document, router]);

  if (error) {
    return <SplashScreen title={error.title} subtitle={error.subtitle} />;
  }
  if (!document) return <SplashScreen title="Loading Document" />;

  return (
    <>
      <title>{document.name}</title>
      {showDiff && <DiffView />}
      <Editor
        document={document}
        editorRef={editorRef}
        onChange={handleChange}
      />
      <EditDocumentInfo documentId={document.id} editorRef={editorRef} />
      <SaveDocumentButton onSave={handleSaveAndNavigate} />
    </>
  );
};

export default DocumentEditor;
