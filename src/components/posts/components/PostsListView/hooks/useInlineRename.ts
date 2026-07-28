"use client";
import { useState } from "react";
import { actions, useDispatch } from "@/store";
import { useRouter } from "next/navigation";

interface UseInlineRenameReturn {
  editingNames: Map<string, string>;
  startRename: (postId: string, currentName: string) => void;
  handleChange: (postId: string, value: string) => void;
  handleCommit: (
    postId: string,
    documentId: string,
    originalName: string,
  ) => Promise<void>;
  handleCancel: (postId: string) => void;
}

export function useInlineRename(): UseInlineRenameReturn {
  const dispatch = useDispatch();
  const router = useRouter();
  const [editingNames, setEditingNames] = useState<Map<string, string>>(
    new Map(),
  );

  const startRename = (postId: string, currentName: string) => {
    setEditingNames((prev) => new Map(prev).set(postId, currentName));
  };

  const handleChange = (postId: string, value: string) => {
    setEditingNames((prev) => new Map(prev).set(postId, value));
  };

  const handleCommit = async (
    postId: string,
    documentId: string,
    originalName: string,
  ) => {
    const newName = editingNames.get(postId)?.trim();
    setEditingNames((prev) => {
      const m = new Map(prev);
      m.delete(postId);
      return m;
    });
    if (!newName || newName === originalName) return;
    await dispatch(
      actions.updatePost({
        id: documentId,
        partial: { name: newName },
      }),
    );
    router.refresh();
  };

  const handleCancel = (postId: string) => {
    setEditingNames((prev) => {
      const m = new Map(prev);
      m.delete(postId);
      return m;
    });
  };

  return {
    editingNames,
    startRename,
    handleChange,
    handleCommit,
    handleCancel,
  };
}
