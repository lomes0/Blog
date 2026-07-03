"use client";
import { useEffect, useState } from "react";
import { useSelector } from "@/store";
import {
  DocumentStatus,
  DocumentUpdateInput,
  User,
  UserDocument,
} from "@/types";
import { useHandleValidation } from "./useHandleValidation";
import { useDocumentSubmit } from "./useDocumentSubmit";

export function useEditDocumentForm(userDocument: UserDocument) {
  const user = useSelector((state) => state.user);
  const localDocument = userDocument?.local;
  const cloudDocument = userDocument?.cloud;
  const isLocal = !!localDocument;
  const isCloud = !!cloudDocument;
  const isPrivate = isCloud && cloudDocument.private;
  const isPublished = isCloud && cloudDocument.published;
  const isCollab = isCloud && cloudDocument.collab;
  const isAuthor = isCloud ? cloudDocument.author.id === user?.id : true;
  const isCloudOnly = !isLocal && isCloud;
  const document = isCloudOnly ? cloudDocument : localDocument;
  const currentStatus = document?.status || DocumentStatus.ACTIVE;

  const name = cloudDocument?.name ?? localDocument?.name ??
    "Untitled Document";
  const handle = cloudDocument?.handle ?? localDocument?.handle ?? null;

  const [input, setInput] = useState<Partial<DocumentUpdateInput>>({
    name,
    handle,
    coauthors: cloudDocument?.coauthors.map((u) => u.email) ?? [],
    private: isPrivate,
    published: isPublished,
    collab: isCollab,
    background_image: document?.background_image || null,
    createdAt: document?.createdAt || new Date().toISOString(),
    status: currentStatus,
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const updateInput = (partial: Partial<DocumentUpdateInput>) => {
    setInput((prev) => ({ ...prev, ...partial }));
  };

  const {
    validating,
    validationErrors,
    hasErrors,
    updateHandle,
    resetValidation,
  } = useHandleValidation(handle, (value) => updateInput({ handle: value }));

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
      coauthors: cloudDocument?.coauthors.map((u) => u.email) ?? [],
      private: isPrivate,
      published: isPublished,
      collab: isCollab,
      background_image: document?.background_image || null,
      createdAt: document?.createdAt || new Date().toISOString(),
      status: currentStatus,
    });
    resetValidation();
  }, [
    userDocument,
    editDialogOpen,
    cloudDocument?.coauthors,
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
    const coauthors = users.map((u) => (typeof u === "string" ? u : u.email));
    updateInput({ coauthors });
  };

  const updateBackgroundImage = (imagePath: string | null) => {
    updateInput({ background_image: imagePath });
  };

  const { handleSubmit } = useDocumentSubmit(
    userDocument,
    input,
    closeEditDialog,
  );

  return {
    cloudDocument,
    document,
    isLocal,
    isCloud,
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
