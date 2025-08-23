"use client";
import { UserDocument } from "@/types";
import { memo, use, useEffect, useState } from "react";
import { useThumbnailContext } from "../../app/context/ThumbnailContext";
import { Box } from "@mui/material";
import { generateHtml } from "@/editor/utils/generateHtml";
import documentDB from "@/indexeddb";
import PostThumbnailSkeleton from "./PostThumbnailSkeleton";

// Simple cache for thumbnails
const thumbnailCache = new Map<string, string>();

/**
 * Get thumbnail from various sources
 */
const getPostThumbnail = async (
  documentId: string,
  revisionId: string,
): Promise<string | null> => {
  // Check cache first
  const cachedThumbnail = thumbnailCache.get(revisionId);
  if (cachedThumbnail) return cachedThumbnail;

  try {
    // Try local document first
    const document = await documentDB.getByID(documentId);
    if (document) {
      const data = document.data;
      const thumbnail = await generateHtml({
        ...data,
        root: { ...data.root, children: data.root.children.slice(0, 3) },
      });
      thumbnailCache.set(revisionId, thumbnail);
      return thumbnail;
    }

    // Fallback to API
    const response = await fetch(`/api/thumbnails/${documentId}`);
    if (response.ok) {
      const { data } = await response.json();
      if (data) {
        thumbnailCache.set(revisionId, data);
        return data;
      }
    }
  } catch (error) {
    console.warn("Failed to load thumbnail:", error);
  }

  return null;
};

/**
 * Simplified post thumbnail component
 * Consolidates DocumentThumbnail and LocalDocumentThumbnail logic
 */
const PostThumbnail: React.FC<{ userDocument?: UserDocument }> = memo(
  ({ userDocument }) => {
    const [thumbnail, setThumbnail] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Get the document to display (prefer local over cloud)
    const localDocument = userDocument?.local;
    const cloudDocument = userDocument?.cloud;
    const document = localDocument || cloudDocument;

    // Try to use thumbnail context first
    const thumbnailContext = useThumbnailContext();
    const contextThumbnail = thumbnailContext?.[document?.head ?? ""];

    useEffect(() => {
      if (!document?.id || !document?.head) {
        setIsLoading(false);
        return;
      }

      // If we have context thumbnail, use it
      if (contextThumbnail) {
        const loadContextThumbnail = async () => {
          try {
            const thumbnailData = await contextThumbnail;
            setThumbnail(thumbnailData);
          } catch (error) {
            console.warn("Context thumbnail failed, falling back:", error);
            // Fall back to regular thumbnail loading
            const fallbackThumbnail = await getPostThumbnail(
              document.id,
              document.head,
            );
            setThumbnail(fallbackThumbnail);
          } finally {
            setIsLoading(false);
          }
        };
        loadContextThumbnail();
        return;
      }

      // Regular thumbnail loading
      const loadThumbnail = async () => {
        const thumbnailData = await getPostThumbnail(
          document.id,
          document.head,
        );
        setThumbnail(thumbnailData);
        setIsLoading(false);
      };

      loadThumbnail();
    }, [document?.id, document?.head, contextThumbnail]);

    if (isLoading) {
      return <PostThumbnailSkeleton />;
    }

    if (!thumbnail) {
      return <PostThumbnailSkeleton />;
    }

    return (
      <Box
        className="post-thumbnail"
        dangerouslySetInnerHTML={{
          __html: thumbnail
            .replaceAll("<a", "<span")
            .replaceAll("</a", "</span"),
        }}
        sx={{
          "& img": {
            maxWidth: "100%",
            height: "auto",
          },
          "& table": {
            fontSize: "0.75rem",
          },
          overflow: "hidden",
        }}
      />
    );
  },
);

PostThumbnail.displayName = "PostThumbnail";

export default PostThumbnail;
