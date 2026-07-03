"use client";
import { actions, useDispatch } from "@/store";
import { DocumentStatus, DocumentUpdateInput, UserDocument } from "@/types";

export function useDocumentSubmit(
  userDocument: UserDocument,
  input: Partial<DocumentUpdateInput>,
  onClose: () => void,
) {
  const dispatch = useDispatch();
  const localDocument = userDocument?.local;
  const cloudDocument = userDocument?.cloud;
  const isLocal = !!localDocument;
  const isCloud = !!cloudDocument;
  const isUploaded = isLocal && isCloud;
  const isCloudOnly = !isLocal && isCloud;
  const document = isCloudOnly ? cloudDocument : localDocument;
  const id = userDocument.id;

  const name = cloudDocument?.name ?? localDocument?.name ??
    "Untitled Document";
  const handle = cloudDocument?.handle ?? localDocument?.handle ?? null;
  const isPrivate = isCloud && cloudDocument.private;
  const isPublished = isCloud && cloudDocument.published;
  const isCollab = isCloud && cloudDocument.collab;
  const currentStatus = document?.status || DocumentStatus.ACTIVE;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onClose();
    const partial: Partial<DocumentUpdateInput> = {};
    if (input.name !== name) {
      partial.name = input.name;
      partial.updatedAt = new Date().toISOString();
    }
    if (input.handle !== handle) partial.handle = input.handle || null;
    if (input.description !== document?.description) {
      partial.description = input.description || null;
    }
    if (
      input.coauthors?.join(",") !==
        cloudDocument?.coauthors.map((u) => u.email).join(",")
    ) {
      partial.coauthors = input.coauthors;
    }
    if (input.private !== isPrivate) partial.private = input.private;
    if (input.published !== isPublished) partial.published = input.published;
    if (input.collab !== isCollab) partial.collab = input.collab;
    if (input.background_image !== document?.background_image) {
      partial.background_image = input.background_image;
    }
    if (input.createdAt && input.createdAt !== document?.createdAt) {
      partial.createdAt = input.createdAt;
    }
    if (input.status !== currentStatus) partial.status = input.status;
    if (document?.parentId) partial.parentId = document.parentId;

    if (Object.keys(partial).length === 0) return;
    if (isLocal) {
      try {
        dispatch(actions.updateLocalDocument({ id, partial }));
      } catch {
        dispatch(actions.announce({
          message: {
            title: "Error Updating Document",
            subtitle: "An error occurred while updating local document",
          },
        }));
      }
    }
    if (isUploaded || isCloud) {
      await dispatch(actions.updateCloudDocument({ id, partial }));
    }
  };

  return { handleSubmit };
}
