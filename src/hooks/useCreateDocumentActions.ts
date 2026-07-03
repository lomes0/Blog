"use client";
import { useCallback } from "react";
import { actions, useDispatch, useSelector } from "@/store";
import type { DocumentCreateInput } from "@/types";

/**
 * Encapsulates Redux dispatch calls and apiClient usage for NewDocument,
 * keeping the component free of direct store and network imports.
 */
export function useCreateDocumentActions() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.user);

  const forkDocument = useCallback(
    async (
      id: string,
      revisionId: string | null,
    ) => {
      try {
        const editorDoc = await dispatch(
          actions.forkLocalDocument({ id, revisionId }),
        ).unwrap();
        return { source: "local" as const, doc: editorDoc };
      } catch {
        try {
          const forked = await dispatch(
            actions.forkCloudDocument({ id, revisionId }),
          ).unwrap();
          return { source: "cloud" as const, doc: forked };
        } catch {
          return null;
        }
      }
    },
    [dispatch],
  );

  const createDocument = useCallback(
    async (
      payload: DocumentCreateInput,
      options: { saveToCloud: boolean; isOnline: boolean },
    ): Promise<{ cloudSaved: boolean }> => {
      await dispatch(actions.createLocalDocument(payload)).unwrap();
      let cloudSaved = false;
      if (options.saveToCloud && options.isOnline && user) {
        try {
          await dispatch(actions.createCloudDocument(payload)).unwrap();
          cloudSaved = true;
        } catch {
          // cloud save is optional – local succeeded, that's enough
        }
      }
      return { cloudSaved };
    },
    [dispatch, user],
  );

  return { user, forkDocument, createDocument };
}
