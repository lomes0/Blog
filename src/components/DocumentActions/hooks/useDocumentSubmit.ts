"use client";
import { actions, useDispatch } from "@/store";
import { DocumentStatus, PostUpdateInput, Post } from "@/types";

export function useDocumentSubmit(
  post: Post,
  input: Partial<PostUpdateInput>,
  onClose: () => void,
) {
  const dispatch = useDispatch();
  const document = post;
  const id = post.id;

  const name = post.name ?? "Untitled Document";
  const handle = post.handle ?? null;
  const isPrivate = !!post.private;
  const isPublished = !!post.published;
  const isCollab = !!post.collab;
  const currentStatus = post.status || DocumentStatus.ACTIVE;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onClose();
    const partial: Partial<PostUpdateInput> = {};
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
        post.coauthors?.map((u) => u.email).join(",")
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
    await dispatch(actions.updatePost({ id, partial }));
  };

  return { handleSubmit };
}
