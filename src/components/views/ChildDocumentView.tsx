"use client";
import { useEffect, useState } from "react";
import { Box, CircularProgress } from "@mui/material";
import { apiClient } from "@/api";

interface ChildDocumentViewProps {
  docId: string;
}

/**
 * Fetches a child document's Lexical state from the API and renders it as
 * HTML via /api/embed. Used by ViewDocument for in-page tab switching.
 */
const ChildDocumentView: React.FC<ChildDocumentViewProps> = ({ docId }) => {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHtml(null);

    apiClient.documents.get(docId)
      .then(async (doc) => {
        if (cancelled || !doc?.data) return;
        const res = await fetch("/api/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(doc.data),
        });
        if (cancelled) return;
        const text = res.ok ? await res.text() : null;
        if (!cancelled) {
          setHtml(text);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [docId]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (!html) return null;

  // Inject as raw HTML (not htmr/React) so the view-mode DOM enhancers can
  // safely restructure code/attachment nodes without React later failing to
  // remove nodes they reparented, throwing "removeChild ... not a child of
  // this node". Raw HTML keeps the content outside React's reconciler.
  return (
    <div
      style={{ display: "contents" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default ChildDocumentView;
