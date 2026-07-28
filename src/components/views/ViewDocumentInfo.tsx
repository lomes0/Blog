"use client";
import AttachmentDrawer from "../drawers/AttachmentDrawer";
import { Post } from "@/types";

export default function ViewDocumentInfo(
  { cloudDocument: _ }: { cloudDocument: Post },
) {
  return <AttachmentDrawer />;
}
