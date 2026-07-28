"use client";
import { useRef, useState } from "react";
import { actions, useDispatch, useSelector } from "@/store";
import { PostUpdateInput, User, Post } from "@/types";
import { useSearchParams } from "next/navigation";

export function useShareDocument(post: Post) {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);
  const isAuthor = post.author ? post.author.id === user?.id : true;
  const isCollab = !!post.collab;
  const isPrivate = !!post.private;
  const id = post.id;
  const name = post.name ?? "Untitled Document";
  const handle = post.handle ?? null;

  const formats = ["view", "embed", "pdf", "docx"];
  if (isAuthor || isCollab) formats.push("edit");

  const [format, setFormat] = useState("view");
  const [revision, setRevision] = useState(post.head ?? null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const shareFormRef = useRef<HTMLFormElement>(null);
  const searchParams = useSearchParams();

  const openShareDialog = () => {
    setFormat(post.collab ? "edit" : "view");
    const v = searchParams.get("v");
    setRevision(v || (post.head ?? null));
    setShareDialogOpen(true);
  };

  const closeShareDialog = (closeMenu?: () => void) => {
    setShareDialogOpen(false);
    if (closeMenu) closeMenu();
  };

  function getShareUrl(formdata: FormData) {
    const url = new URL(window.location.origin);
    url.pathname = `/${format}/${handle || id}`;
    if (revision && revision !== post.head) {
      url.searchParams.append("v", revision);
    }
    if (format === "pdf") {
      url.pathname += ".pdf";
      const scale = formdata.get("scale") as string;
      const landscape = formdata.get("landscape") as string;
      const fmt = formdata.get("format") as string;
      if (scale !== "1") url.searchParams.append("scale", scale);
      if (landscape !== "false") {
        url.searchParams.append("landscape", landscape);
      }
      if (fmt !== "a4") url.searchParams.append("format", fmt);
    }
    if (format === "docx") url.pathname += ".docx";
    return url;
  }

  const copyLink = async () => {
    const shareForm = shareFormRef.current;
    if (!shareForm) return;
    const url = getShareUrl(new FormData(shareForm));
    try {
      await navigator.clipboard.writeText(url.toString());
      dispatch(
        actions.announce({ message: { title: "Link Copied to Clipboard" } }),
      );
    } catch {
      dispatch(
        actions.announce({
          message: { title: "Failed to Copy Link to Clipboard" },
        }),
      );
    }
  };

  const handleShare = async (
    event: React.FormEvent<HTMLFormElement>,
    closeMenu?: () => void,
  ) => {
    event.preventDefault();
    const formdata = new FormData(event.currentTarget);
    const url = getShareUrl(formdata);
    closeShareDialog(closeMenu);
    await navigator.share({ title: name, url: url.toString() });
  };

  const togglePrivate = async () => {
    const payload: { id: string; partial: PostUpdateInput } = {
      id,
      partial: { private: !isPrivate },
    };
    if (isPrivate === false) {
      if (post.published) payload.partial.published = false;
      if (post.collab) payload.partial.collab = false;
    }
    try {
      await dispatch(actions.updatePost(payload)).unwrap();
      dispatch(actions.announce({
        message: {
          title: "Document Privacy Updated",
          subtitle: `Document is now ${
            payload.partial.private ? "private" : "shared by link"
          }`,
        },
      }));
    } catch {
      // update failed
    }
  };

  const toggleCollab = async () => {
    const payload = { id, partial: { collab: !isCollab } };
    try {
      await dispatch(actions.updatePost(payload)).unwrap();
      dispatch(actions.announce({
        message: {
          title: "Document Collaboration Updated",
          subtitle: `Document is now ${
            payload.partial.collab ? "collaborative" : "shared by link"
          }`,
        },
      }));
    } catch {
      // update failed
    }
  };

  const updateCoauthors = (users: (User | string)[]) => {
    const coauthors = users.map((u) => (typeof u === "string" ? u : u.email));
    dispatch(
      actions.updatePost({
        id: post.id,
        partial: { coauthors },
      }),
    );
  };

  return {
    post,
    isAuthor,
    isCollab,
    isPrivate,
    isPublished: !!post.published,
    name,
    formats,
    format,
    setFormat,
    revision,
    setRevision,
    shareDialogOpen,
    shareFormRef,
    openShareDialog,
    closeShareDialog,
    copyLink,
    handleShare,
    togglePrivate,
    toggleCollab,
    updateCoauthors,
  };
}
