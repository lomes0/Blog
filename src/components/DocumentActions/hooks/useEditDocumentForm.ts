"use client";
import { useEffect, useState } from "react";
import { useSelector } from "@/store";
import {
  DocumentStatus,
  PostUpdateInput,
  User,
  Post,
} from "@/types";
import { useHandleValidation } from "@/hooks/useHandleValidation";
import { useDocumentSubmit } from "./useDocumentSubmit";

export function useEditDocumentForm(post: Post) {
  const user = useSelector((state) => state.user);
  const document = post;
  const isPrivate = !!post.private;
  const isPublished = !!post.published;
  const isCollab = !!post.collab;
  // A post with no author is a guest draft, which is by definition the viewer's.
  const isAuthor = post.author ? post.author.id === user?.id : true;
  const currentStatus = post.status || DocumentStatus.ACTIVE;

  const name = post.name ?? "Untitled Document";
  const handle = post.handle ?? null;

  const [input, setInput] = useState<Partial<PostUpdateInput>>({
    name,
    handle,
    coauthors: post.coauthors?.flatMap((u) => u.email ? [u.email] : []) ?? [],
    private: isPrivate,
    published: isPublished,
    collab: isCollab,
    background_image: document?.background_image || null,
    createdAt: document?.createdAt || new Date().toISOString(),
    status: currentStatus,
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const updateInput = (partial: Partial<PostUpdateInput>) => {
    setInput((prev) => ({ ...prev, ...partial }));
  };

  const {
    validating,
    validationErrors,
    hasErrors,
    updateHandle,
    resetValidation,
  } = useHandleValidation({
    currentHandle: handle,
    onChange: (value) => updateInput({ handle: value }),
  });

  const openEditDialog = (closeMenu?: () => void) => {
    if (closeMenu) closeMenu();
    setEditDialogOpen(true);
  };

  const closeEditDialog = () => setEditDialogOpen(false);

  useEffect(() => {
    setInput({
      name,
      handle,
      description: document?.description || "",
      coauthors: post.coauthors?.flatMap((u) => u.email ? [u.email] : []) ?? [],
      private: isPrivate,
      published: isPublished,
      collab: isCollab,
      background_image: document?.background_image || null,
      createdAt: document?.createdAt || new Date().toISOString(),
      status: currentStatus,
    });
    resetValidation();
  }, [
    post,
    editDialogOpen,
    post.coauthors,
    currentStatus,
    document?.background_image,
    document?.createdAt,
    document?.description,
    handle,
    isCollab,
    isPrivate,
    isPublished,
    name,
    resetValidation,
  ]);

  const updateCoauthors = (users: (User | string)[]) => {
    const coauthors = users.flatMap((u) => typeof u === "string" ? [u] : u.email ? [u.email] : []);
    updateInput({ coauthors });
  };

  const updateBackgroundImage = (imagePath: string | null) => {
    updateInput({ background_image: imagePath });
  };

  const { handleSubmit } = useDocumentSubmit(
    post,
    input,
    closeEditDialog,
  );

  return {
    document,
    isAuthor,
    isPublished,
    isCollab,
    isPrivate,
    input,
    validating,
    validationErrors,
    hasErrors,
    editDialogOpen,
    updateInput,
    updateCoauthors,
    updateBackgroundImage,
    updateHandle,
    openEditDialog,
    closeEditDialog,
    handleSubmit,
  };
}
